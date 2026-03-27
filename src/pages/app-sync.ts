import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import { bleService } from '../ble-service';
import {
  DeviceRun,
  getDeviceRuns,
  hasDeviceRun,
  saveDeviceRun,
  onDeviceRunsChanged,
  parseMeta,
  applyCarryForward,
} from '../device-log-store';
import { uploadPendingRuns, onUploadProgress } from '../run-upload-service';
import {
  collection, query, where, getDocs, deleteDoc, doc, Timestamp, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';

// ── Web NFC stubs ─────────────────────────────────────────────────────────
declare class NDEFReader extends EventTarget {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  onreading: ((event: NDEFReadingEvent) => void) | null;
}
declare interface NDEFRecord { recordType: string; data?: DataView; }
declare interface NDEFMessage { records: NDEFRecord[]; }
declare interface NDEFReadingEvent extends Event { serialNumber: string; message: NDEFMessage; }

/** Extract tagId from an NFC reading event.
 *  Prefer a text NDEF record; fall back to serialNumber with colons stripped. */
function tagIdFromNfc(e: NDEFReadingEvent): string {
  for (const r of e.message?.records ?? []) {
    if (r.recordType === 'text' && r.data) {
      const bytes = new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength);
      const langLen = bytes[0] & 0x3f;          // first byte encodes lang length
      const text = new TextDecoder().decode(bytes.slice(1 + langLen));
      if (text.trim()) return text.trim().toUpperCase();
    }
  }
  // Fall back to hardware serial number, strip colons/dashes
  return e.serialNumber.replace(/[:\-]/g, '').toUpperCase();
}

// ── Types ─────────────────────────────────────────────────────────────────
type SyncStatus = 'idle' | 'listing' | 'downloading' | 'done' | 'error';

interface CloudDoc {
  firebaseDocId: string;
  tagId: string;
  startTime: number;
  uploadedAt: number;
}

const COLLECTION = 'device_runs';

@customElement('app-sync')
export class AppSync extends LitElement {

  // ── Local / device state ─────────────────────────────────────────────
  @state() private connected      = bleService.connStatus === 'connected';
  @state() private runs: DeviceRun[] = getDeviceRuns();
  @state() private deviceOnlyIds: number[] = [];
  @state() private syncStatus: SyncStatus = 'idle';
  @state() private syncMsg      = '';
  @state() private syncProgress = '';

  // ── Cloud state ───────────────────────────────────────────────────────
  @state() private nfcAvail      = 'NDEFReader' in window;
  @state() private scanning      = false;
  @state() private searching     = false;
  @state() private searched      = false;
  @state() private tagId         = '';
  @state() private cloudResults: CloudDoc[] = [];
  @state() private allDocs:      CloudDoc[] = [];
  @state() private loadingAll    = true;

  private _nfcAbort:    AbortController | null = null;
  private _searchAbort: AbortController | null = null;

  private _onStatus    = () => { this.connected = bleService.connStatus === 'connected'; };
  private _onSyncCheck = () => {
    const localIds = new Set(getDeviceRuns().map(r => r.id));
    this.deviceOnlyIds = bleService.deviceRunIds.filter(id => !localIds.has(id));
  };
  private _unsub?:   () => void;
  private _unsubUp?: () => void;

  connectedCallback() {
    super.connectedCallback();
    bleService.addEventListener('status-changed',     this._onStatus);
    bleService.addEventListener('sync-check-changed', this._onSyncCheck);
    this._unsub   = onDeviceRunsChanged(() => { this.runs = getDeviceRuns(); this._onSyncCheck(); });
    this._unsubUp = onUploadProgress(() => { this.runs = getDeviceRuns(); });
    this._onSyncCheck();
    this._loadCloud();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    bleService.removeEventListener('status-changed',     this._onStatus);
    bleService.removeEventListener('sync-check-changed', this._onSyncCheck);
    this._unsub?.();
    this._unsubUp?.();
    this._nfcAbort?.abort();
    this._searchAbort?.abort();
  }

  // ── Cloud helpers ─────────────────────────────────────────────────────

  private async _loadCloud() {
    this.loadingAll = true;
    try {
      const snap = await getDocs(query(collection(db, COLLECTION), orderBy('startTime', 'desc')));
      this.allDocs = snap.docs.map(d => this._toCloudDoc(d.id, d.data()));
    } catch { /* ignore */ } finally { this.loadingAll = false; }
  }

  private _toCloudDoc(id: string, d: Record<string, unknown>): CloudDoc {
    const uploadedAt = d['uploadedAt'] instanceof Timestamp
      ? d['uploadedAt'].toMillis() : Number(d['uploadedAt'] ?? 0);
    const rawStart = Number(d['startTime'] ?? 0);
    return {
      firebaseDocId: id,
      tagId:         String(d['tagId'] ?? ''),
      startTime:     rawStart < 1e12 ? rawStart * 1000 : rawStart,
      uploadedAt,
    };
  }

  private async _delete(docId: string) {
    try {
      await deleteDoc(doc(db, COLLECTION, docId));
      this.allDocs      = this.allDocs.filter(d => d.firebaseDocId !== docId);
      this.cloudResults = this.cloudResults.filter(d => d.firebaseDocId !== docId);
    } catch (err) { console.warn('[cloud] delete failed:', err); }
  }

  private async _startScan() {
    this._nfcAbort?.abort();
    this._nfcAbort = new AbortController();
    this.scanning  = true;
    try {
      const reader = new (window as any).NDEFReader() as NDEFReader;
      reader.onreading = (e: NDEFReadingEvent) => {
        this._nfcAbort?.abort(); this._nfcAbort = null; this.scanning = false;
        this._search(tagIdFromNfc(e));
      };
      await reader.scan({ signal: this._nfcAbort.signal });
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      this.scanning = false;
    }
  }

  private _stopScan() { this._nfcAbort?.abort(); this._nfcAbort = null; this.scanning = false; }

  private _onInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    this.tagId = val;
    this._searchAbort?.abort();
    if (!val.trim()) { this.searched = false; this.cloudResults = []; return; }
    const ac = new AbortController();
    this._searchAbort = ac;
    setTimeout(() => { if (!ac.signal.aborted) this._search(val); }, 300);
  }

  private async _search(raw: string) {
    this.tagId = raw; this.searching = true; this.searched = false; this.cloudResults = [];
    try {
      const snap = await getDocs(query(collection(db, COLLECTION), where('tagId', '==', raw.trim())));
      this.cloudResults = snap.docs.map(d => this._toCloudDoc(d.id, d.data()));
    } catch { /* ignore */ }
    this.searching = false; this.searched = true;
  }

  // ── Device sync ───────────────────────────────────────────────────────

  private _tryJson(line: string): Record<string, unknown> | null {
    const t = line.trim();
    if (!t.startsWith('{')) return null;
    try { return JSON.parse(t); } catch { return null; }
  }

  private _findError(lines: string[]): string | null {
    for (const l of lines) { if (l.startsWith('ERROR')) return l; }
    return null;
  }

  private async _sync() {
    if (this.syncStatus === 'listing' || this.syncStatus === 'downloading') return;
    this.syncStatus = 'listing'; this.syncMsg = ''; this.syncProgress = '';

    const listLines = await bleService.sendCmd('listRuns');
    const listErr   = this._findError(listLines);
    if (listErr) { this.syncStatus = 'error'; this.syncMsg = listErr; return; }

    let deviceIds: number[] = [];
    for (const l of listLines) {
      const j = this._tryJson(l);
      if (j && Array.isArray(j['runs'])) { deviceIds = (j['runs'] as unknown[]).map(Number); break; }
    }

    if (deviceIds.length === 0) { this.syncStatus = 'done'; this.syncMsg = 'No runs on device.'; return; }

    const toDownload = deviceIds.filter(id => !hasDeviceRun(id));
    if (toDownload.length === 0) {
      this.syncStatus = 'done';
      this.syncMsg = `Already up to date — ${deviceIds.length} run(s) on device.`;
      return;
    }

    this.syncStatus = 'downloading';
    let done = 0;
    for (const id of toDownload) {
      this.syncProgress = `${done} / ${toDownload.length}`;
      const logLines = await bleService.sendCmd(`getStateLogs -run ${id}`);
      const logErr   = this._findError(logLines);
      if (logErr) { this.syncStatus = 'error'; this.syncMsg = `Run ${id}: ${logErr}`; return; }

      const dataLines = logLines.filter(l => { const t = l.trim(); return t !== '' && !t.startsWith('{'); });
      if (dataLines.length < 3) {
        this.syncStatus = 'error'; this.syncMsg = `Run ${id}: not enough header lines`; return;
      }

      const fields  = ['timestamp', ...dataLines[0].split(',')];
      const units   = ['ms',        ...dataLines[1].split(',')];
      const meta    = parseMeta(dataLines[2]);
      const rows    = applyCarryForward(dataLines.slice(3).map(l => l.split(','))).map((row, i) => [
        String(meta.startTime + i * meta.interval), ...row,
      ]);

      saveDeviceRun({ id, downloadedAt: Date.now(), fields, units, meta, rows });
      done++;
      this.syncProgress = `${done} / ${toDownload.length}`;
    }

    this.syncStatus = 'done';
    this.syncMsg    = `Downloaded ${toDownload.length} new run(s). Total: ${deviceIds.length}.`;
    this.syncProgress = '';
    bleService.unsyncedCount = 0;
    bleService.dispatchEvent(new CustomEvent('sync-check-changed'));
    uploadPendingRuns();
  }

  // ── Render helpers ────────────────────────────────────────────────────

  private _renderRun(run: DeviceRun) {
    const fmtTs         = (ms: number) => new Date(ms).toLocaleString();
    const sampledTip    = run.meta.startTime ? `Sampled: ${fmtTs(run.meta.startTime)}` : 'Sampled';
    const downloadedTip = `Downloaded: ${fmtTs(run.downloadedAt)}`;
    const step3Class    = run.firebaseId ? 'active' : run.uploadError ? 'error' : 'warn';
    const uploadedTip   = run.firebaseId
      ? (run.cloudUploadedAt ? `Uploaded: ${fmtTs(run.cloudUploadedAt)}` : 'Uploaded to cloud')
      : run.uploadError === 'duplicate' ? 'Duplicate: tag ID already exists in cloud'
      : 'Not yet uploaded';

    return html`
      <a class="run-item" href="#run/${run.id}">
        <div class="run-info">
          <span class="run-name">${run.meta?.tagId || `Run #${run.id}`}</span>
          <span class="run-date">${run.meta.startTime ? new Date(run.meta.startTime).toLocaleDateString() : '—'}</span>
        </div>
        <div class="run-steps">
          <span class="step-btn active" data-tip="${sampledTip}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z"/></svg>
          </span>
          <span class="step-connector active"></span>
          <span class="step-btn active" data-tip="${downloadedTip}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17 12h-5V7h-2v5H5l7 7 7-7zm-7 9v2h10v-2H10z"/></svg>
          </span>
          <span class="step-connector ${run.firebaseId ? 'active' : ''}"></span>
          <span class="step-btn ${step3Class}" data-tip="${uploadedTip}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
          </span>
        </div>
        <span class="run-arrow">›</span>
      </a>`;
  }

  private _renderDeviceOnlyRun(id: number) {
    return html`
      <div class="run-item device-only">
        <div class="run-info">
          <span class="run-name">Run #${id}</span>
          <span class="run-date">Not yet downloaded</span>
        </div>
        <div class="run-steps">
          <span class="step-btn active" data-tip="Exists on device">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z"/></svg>
          </span>
          <span class="step-connector"></span>
          <span class="step-btn warn" data-tip="Not downloaded">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17 12h-5V7h-2v5H5l7 7 7-7zm-7 9v2h10v-2H10z"/></svg>
          </span>
          <span class="step-connector"></span>
          <span class="step-btn warn" data-tip="Not uploaded">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
          </span>
        </div>
        <span class="run-arrow">›</span>
      </div>`;
  }

  private _renderCloudRow(d: CloudDoc) {
    const name = d.tagId || `Doc ${d.firebaseDocId.slice(0, 6)}`;
    const date = d.startTime ? new Date(d.startTime).toLocaleDateString() : '—';
    return html`
      <div class="cloud-row">
        <div class="run-info">
          <span class="run-name">${name}</span>
          <span class="run-date">${date}</span>
        </div>
        <a class="btn-sm" href="#cloud-run/${d.firebaseDocId}">View</a>
        <button class="btn-sm btn-danger" @click=${() => this._delete(d.firebaseDocId)}>Delete</button>
      </div>`;
  }

  // ── Styles ────────────────────────────────────────────────────────────

  static styles = css`
    :host {
      --bg:       #09090b;
      --card:     #111113;
      --border:   #58585f;
      --fg:       #fafafa;
      --muted-fg: #c4c4cc;
      --sans: 'Geist', 'Inter', system-ui, sans-serif;
      --mono: 'Share Tech Mono', monospace;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    main {
      font-family: var(--sans);
      background: var(--bg);
      color: var(--fg);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0 0 80px;
    }

    .page-header {
      width: 100%;
      max-width: 560px;
      padding: 24px 20px 0;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .back-btn {
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: transparent;
      color: var(--muted-fg);
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
      text-decoration: none;
      font-size: 1rem;
    }

    .back-btn:hover { color: var(--fg); border-color: #72727a; }

    .page-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--fg);
    }

    .content {
      width: 100%;
      max-width: 560px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .alert {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 11px 14px;
      border: 1px solid #3f1f1a;
      border-radius: 8px;
      background: rgba(239,68,68,0.06);
      font-size: 0.8125rem;
      color: #fca5a5;
    }

    .alert a {
      margin-left: auto;
      font-size: 0.75rem;
      font-family: var(--mono);
      color: var(--fg);
      border: 1px solid var(--border);
      padding: 3px 10px;
      border-radius: 5px;
      text-decoration: none;
      white-space: nowrap;
    }

    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px 18px;
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
    }

    .card-title {
      font-size: 0.75rem;
      font-weight: 500;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--muted-fg);
    }

    /* ── Device sync ── */
    .sync-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

    .btn-sync {
      font-family: var(--sans);
      font-size: 0.875rem;
      font-weight: 500;
      padding: 9px 28px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      background: var(--fg);
      color: #09090b;
      transition: opacity 0.15s;
    }

    .btn-sync:hover:not(:disabled) { opacity: 0.88; }
    .btn-sync:disabled { opacity: 0.3; cursor: not-allowed; }

    .sync-status { font-family: var(--mono); font-size: 0.72rem; }
    .sync-status.listing,
    .sync-status.downloading { color: #a1a1aa; animation: blink 0.8s infinite; }
    .sync-status.done  { color: #22c55e; }
    .sync-status.error { color: #f87171; }

    @keyframes blink { 50% { opacity: 0.4; } }

    /* ── Local runs ── */
    .runs-list { display: flex; flex-direction: column; gap: 6px; overflow: visible; }

    .run-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border: 1px solid var(--border);
      border-radius: 6px;
      text-decoration: none;
      color: var(--fg);
      cursor: pointer;
      transition: background 0.12s, border-color 0.12s;
      position: relative;
    }

    .run-item:hover { background: #18181b; border-color: #72727a; }
    .run-item.device-only { opacity: 0.55; cursor: default; pointer-events: none; }

    .run-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }

    .run-name {
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--fg);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .run-date { font-family: var(--mono); font-size: 0.65rem; color: var(--muted-fg); }

    .run-steps { display: flex; align-items: center; flex-shrink: 0; }

    .step-connector { width: 16px; height: 1px; background: var(--border); flex-shrink: 0; }
    .step-connector.active { background: #22c55e; }

    .step-btn {
      position: relative;
      width: 28px; height: 28px;
      border-radius: 50%;
      border: 1.5px solid var(--border);
      background: var(--bg);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      color: #52525b;
    }

    .step-btn.active { border-color: #22c55e; color: #22c55e; background: rgba(34,197,94,0.06); }
    .step-btn.warn   { border-color: #52525b; color: #52525b; }
    .step-btn.error  { border-color: #ef4444; color: #ef4444; background: rgba(239,68,68,0.06); }

    .step-btn::after {
      content: attr(data-tip);
      position: absolute;
      bottom: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      background: #18181b;
      border: 1px solid #3f3f46;
      color: var(--fg);
      font-family: var(--mono);
      font-size: 0.62rem;
      padding: 4px 8px;
      border-radius: 4px;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.12s;
      z-index: 999;
    }

    .step-btn:hover::after { opacity: 1; }

    .run-arrow {
      font-size: 0.85rem;
      color: var(--muted-fg);
      flex-shrink: 0;
      margin-left: 4px;
      transition: transform 0.15s;
    }

    .run-item:hover .run-arrow { transform: translateX(2px); }

    .empty-msg {
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--muted-fg);
      text-align: center;
      padding: 24px 0;
    }

    /* ── Cloud section ── */
    .search-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 14px;
    }

    .tag-input {
      flex: 1;
      background: #09090b;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 12px;
      font-family: var(--mono);
      font-size: 0.8125rem;
      color: var(--fg);
      outline: none;
      transition: border-color 0.15s;
      min-width: 0;
    }

    .tag-input:focus { border-color: #72727a; }
    .tag-input::placeholder { color: #52525b; }

    .btn-nfc {
      display: flex; align-items: center; justify-content: center;
      width: 36px; height: 36px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted-fg);
      cursor: pointer;
      flex-shrink: 0;
      transition: border-color 0.15s, color 0.15s;
    }

    .btn-nfc:hover:not(:disabled)    { border-color: #72727a; color: var(--fg); }
    .btn-nfc.nfc-unavail { opacity: 0.35; cursor: not-allowed; }
    .btn-nfc.scanning { border-color: #3b82f6; color: #60a5fa;
                        animation: nfc-pulse 1.5s ease-in-out infinite; }

    @keyframes nfc-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.3); }
      50%       { box-shadow: 0 0 0 6px rgba(59,130,246,0); }
    }

    .cloud-list { display: flex; flex-direction: column; }

    .cloud-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
    }

    .cloud-row:last-child { border-bottom: none; }

    .btn-sm {
      font-family: var(--sans);
      font-size: 0.75rem;
      font-weight: 500;
      padding: 4px 11px;
      border-radius: 5px;
      cursor: pointer;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--muted-fg);
      text-decoration: none;
      transition: border-color 0.15s, color 0.15s;
      flex-shrink: 0;
      white-space: nowrap;
    }

    .btn-sm:hover          { border-color: #72727a; color: var(--fg); }
    .btn-sm.btn-danger:hover { border-color: #ef4444; color: #f87171; }

    .info-msg {
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--muted-fg);
      text-align: center;
      padding: 20px 0;
    }

    .filter-label {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--muted-fg);
      margin-top: 4px;
    }

    .filter-tag {
      color: #60a5fa;
      font-weight: 600;
    }
  `;

  // ── Render ────────────────────────────────────────────────────────────

  private _clearSearch() {
    this._stopScan();
    this.tagId = ''; this.searched = false; this.cloudResults = [];
    this._searchAbort?.abort();
  }

  render() {
    const busy        = this.syncStatus === 'listing' || this.syncStatus === 'downloading';
    const showResults = this.searched || this.searching;
    const displayDocs = showResults ? this.cloudResults : this.allDocs;

    const filterTag   = showResults ? this.tagId.trim() : '';
    const localFiltered = filterTag
      ? this.runs.filter(r => r.meta?.tagId?.toUpperCase() === filterTag.toUpperCase())
      : this.runs;
    const deviceFiltered = filterTag ? [] : this.deviceOnlyIds;
    const totalLocal  = localFiltered.length + deviceFiltered.length;

    return html`
      <main>
        <div class="page-header">
          <a class="back-btn" href="${resolveRouterPath()}">←</a>
          <span class="page-title">Runs</span>
        </div>

        <div class="content">

          ${!this.connected ? html`
            <div class="alert">
              <span>Device not connected</span>
              <a href="${resolveRouterPath('connect')}">Connect →</a>
            </div>
          ` : ''}

          <!-- Tag ID Search -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">Tag ID Lookup</span>
            </div>
            <div class="search-row">
              <input
                class="tag-input"
                type="text"
                placeholder="Search by RFID tag ID…"
                .value=${this.tagId}
                @input=${this._onInput}
              />
              ${this.tagId ? html`
                <button class="btn-nfc" title="Clear search" @click=${this._clearSearch}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                  </svg>
                </button>
              ` : html`
                <button
                  class="btn-nfc ${this.scanning ? 'scanning' : ''} ${!this.nfcAvail ? 'nfc-unavail' : ''}"
                  title="${!this.nfcAvail ? 'NFC not available on this device (requires Android Chrome)' : this.scanning ? 'Stop scanning' : 'Scan NFC tag'}"
                  ?disabled=${!this.nfcAvail}
                  @click=${this.nfcAvail ? (this.scanning ? this._stopScan : this._startScan) : undefined}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
                    <path d="M6 15h2v-2H6v2zm0-4h2V9H6v2zm0-4h2V5H6v2zm4 8h2v-2h-2v2zm0-4h2V9h-2v2zm0-4h2V5h-2v2zm4 8h2v-2h-2v2zm0-4h2V9h-2v2zm0-4h2V5h-2v2z"/>
                  </svg>
                </button>
              `}
            </div>
            ${showResults && !this.searching ? html`
              <p class="filter-label">
                Showing results for <span class="filter-tag">${this.tagId}</span>
              </p>
            ` : this.scanning ? html`
              <p class="info-msg">Hold NFC tag close to scan…</p>
            ` : ''}
          </div>

          <!-- Device Sync -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">Device Sync</span>
            </div>
            <div class="sync-row">
              <button class="btn-sync" ?disabled=${!this.connected || busy} @click=${this._sync}>
                ${busy ? 'Syncing…' : 'Sync'}
              </button>
              ${this.syncStatus !== 'idle' ? html`
                <span class="sync-status ${this.syncStatus}">
                  ${this.syncStatus === 'listing'     ? 'Listing runs on device…'
                  : this.syncStatus === 'downloading' ? `Downloading… ${this.syncProgress}`
                  : this.syncMsg}
                </span>
              ` : ''}
            </div>
          </div>

          <!-- Local Runs -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">
                ${filterTag ? `Local — ${totalLocal} match${totalLocal !== 1 ? 'es' : ''}` : `Local Runs (${this.runs.length + this.deviceOnlyIds.length})`}
              </span>
            </div>
            ${totalLocal === 0
              ? html`<div class="empty-msg">
                  ${filterTag
                    ? `No local run with tag "${this.tagId}".`
                    : 'No runs yet. Connect to device and press Sync.'}
                </div>`
              : html`
                <div class="runs-list">
                  ${deviceFiltered.map(id => this._renderDeviceOnlyRun(id))}
                  ${localFiltered.map(run => this._renderRun(run))}
                </div>
              `}
          </div>

          <!-- Cloud Runs -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">
                ${showResults
                  ? `Cloud — ${this.cloudResults.length} match${this.cloudResults.length !== 1 ? 'es' : ''}`
                  : `Cloud Runs (${this.allDocs.length})`}
              </span>
            </div>
            ${this.searching ? html`
              <p class="info-msg">Searching…</p>
            ` : displayDocs.length === 0 ? html`
              <p class="info-msg">
                ${this.loadingAll ? 'Loading…'
                : showResults ? `No cloud run found for "${this.tagId}".`
                : 'No runs uploaded to cloud yet.'}
              </p>
            ` : html`
              <div class="cloud-list">
                ${displayDocs.map(d => this._renderCloudRow(d))}
              </div>
            `}
          </div>

        </div>
      </main>
    `;
  }
}
