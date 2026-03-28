import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import { bleService } from '../ble-service';
import {
  DeviceRun,
  getDeviceRuns,
  hasDeviceRunByRunId,
  saveDeviceRun,
  onDeviceRunsChanged,
  parseMeta,
  applyCarryForward,
} from '../device-log-store';
import { uploadPendingRuns, onUploadProgress, isUploading } from '../run-upload-service';
import {
  collection, query, getDocs, deleteDoc, doc, Timestamp, orderBy, limit,
} from 'firebase/firestore';
import { db } from '../firebase';

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
  @state() private deviceOnlyRuns: Array<{idx: number; runId: string; tagId: string; startTime: number}> = [];
  @state() private syncStatus: SyncStatus = 'idle';
  @state() private syncMsg      = '';
  @state() private syncProgress = '';

  // ── Cloud state ───────────────────────────────────────────────────────
  @state() private allDocs:   CloudDoc[] = [];
  @state() private loadingAll = true;

  private _onStatus    = () => { this.connected = bleService.connStatus === 'connected'; };
  private _onSyncCheck = () => {
    this.deviceOnlyRuns = bleService.deviceRuns.filter(r => {
      if (r.runId) return !hasDeviceRunByRunId(r.runId);
      return !getDeviceRuns().some(local => local.id === r.idx);
    });
  };
  private _unsub?:   () => void;
  @state() private _online    = navigator.onLine;
  @state() private _uploading = false;

  private _onOnline  = () => { this._online = true; };
  private _onOffline = () => { this._online = false; };

  private _unsubUp?: () => void;
  private _prevUploading = false;

  connectedCallback() {
    super.connectedCallback();
    bleService.addEventListener('status-changed',     this._onStatus);
    bleService.addEventListener('sync-check-changed', this._onSyncCheck);
    this._unsub   = onDeviceRunsChanged(() => { this.runs = getDeviceRuns(); this._onSyncCheck(); });
    this._unsubUp = onUploadProgress(() => {
      this.runs = getDeviceRuns();
      const uploading = isUploading();
      if (this._prevUploading && !uploading) this._loadCloud();
      this._prevUploading = uploading;
      this._uploading = uploading;
    });
    window.addEventListener('online',  this._onOnline);
    window.addEventListener('offline', this._onOffline);
    this._onSyncCheck();
    this._loadCloud();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    bleService.removeEventListener('status-changed',     this._onStatus);
    bleService.removeEventListener('sync-check-changed', this._onSyncCheck);
    this._unsub?.();
    this._unsubUp?.();
    window.removeEventListener('online',  this._onOnline);
    window.removeEventListener('offline', this._onOffline);
  }

  // ── Cloud helpers ─────────────────────────────────────────────────────

  private async _loadCloud() {
    this.loadingAll = true;
    try {
      const snap = await getDocs(query(collection(db, COLLECTION), orderBy('startTime', 'desc'), limit(10)));
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
      this.allDocs = this.allDocs.filter(d => d.firebaseDocId !== docId);
    } catch (err) { console.warn('[cloud] delete failed:', err); }
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

    const deviceRuns: Array<{idx: number; runId: string; tagId: string; startTime: number}> = [];
    for (const l of listLines) {
      const j = this._tryJson(l);
      if (j?.['run']) {
        const r = j['run'] as Record<string, unknown>;
        deviceRuns.push({
          idx:       Number(r['idx']       ?? 0),
          runId:     String(r['runId']      ?? ''),
          tagId:     String(r['tagId']      ?? ''),
          startTime: Number(r['startTime']  ?? 0),
        });
      }
    }

    if (deviceRuns.length === 0) { this.syncStatus = 'done'; this.syncMsg = 'No runs on device.'; return; }

    const toDownload = deviceRuns.filter(r =>
      r.runId ? !hasDeviceRunByRunId(r.runId) : !getDeviceRuns().some(local => local.id === r.idx)
    );
    if (toDownload.length === 0) {
      this.syncStatus = 'done';
      this.syncMsg = `Already up to date — ${deviceRuns.length} run(s) on device.`;
      return;
    }

    this.syncStatus = 'downloading';
    let done = 0;
    for (const r of toDownload) {
      this.syncProgress = `${done} / ${toDownload.length}`;
      const logLines = await bleService.sendCmd(`getStateLogs -run ${r.idx}`);
      const logErr   = this._findError(logLines);
      if (logErr) { this.syncStatus = 'error'; this.syncMsg = `Run ${r.idx}: ${logErr}`; return; }

      const dataLines = logLines.filter(l => { const t = l.trim(); return t !== '' && !t.startsWith('{'); });
      if (dataLines.length < 3) {
        this.syncStatus = 'error'; this.syncMsg = `Run ${r.idx}: not enough header lines`; return;
      }

      const fields  = ['timestamp', ...dataLines[0].split(',')];
      const units   = ['ms',        ...dataLines[1].split(',')];
      const meta    = parseMeta(dataLines[2]);
      const rows    = applyCarryForward(dataLines.slice(3).map(l => l.split(','))).map((row, i) => [
        String(meta.startTime + i * meta.interval), ...row,
      ]);

      saveDeviceRun({ id: r.idx, downloadedAt: Date.now(), fields, units, meta, rows });
      done++;
      this.syncProgress = `${done} / ${toDownload.length}`;
    }

    this.syncStatus = 'done';
    this.syncMsg    = `Downloaded ${toDownload.length} new run(s). Total: ${deviceRuns.length}.`;
    this.syncProgress = '';
    bleService.unsyncedCount = 0;
    bleService.dispatchEvent(new CustomEvent('sync-check-changed'));
    uploadPendingRuns();
  }

  // ── Render helpers ────────────────────────────────────────────────────

  private _fmt(ms: number) {
    return ms ? new Date(ms).toLocaleDateString() : '—';
  }

  /** Unified run card used in all three sections. */
  private _renderRunItem({
    name, date, href, onDelete, dimmed,
  }: {
    name: string;
    date: string;
    href?: string;
    onDelete?: () => void;
    dimmed?: boolean;
  }) {
    return html`
      <div class="run-item ${dimmed ? 'run-item--dimmed' : ''}">
        <div class="run-info">
          <span class="run-name">${name}</span>
          <span class="run-date">${date}</span>
        </div>
        <div class="run-actions">
          ${href
            ? html`<a class="btn-sm" href="${href}">View</a>`
            : html`<span class="btn-sm btn-disabled">View</span>`}
          ${onDelete
            ? html`<button class="btn-sm btn-danger" @click=${onDelete}>Delete</button>`
            : ''}
        </div>
      </div>`;
  }

  private _renderDeviceOnlyRun(r: {idx: number; tagId: string; startTime: number}) {
    return this._renderRunItem({
      name:   r.tagId || `Run #${r.idx}`,
      date:   r.startTime ? new Date(r.startTime * 1000).toLocaleDateString() : '—',
      dimmed: true,
    });
  }

  private _renderRun(run: DeviceRun) {
    return this._renderRunItem({
      name: run.meta?.tagId || `Run #${run.id}`,
      date: this._fmt(run.meta?.startTime),
      href: `#run/${run.id}`,
    });
  }

  private _renderCloudRow(d: CloudDoc) {
    return this._renderRunItem({
      name:     d.tagId || `Doc ${d.firebaseDocId.slice(0, 6)}`,
      date:     this._fmt(d.startTime),
      href:     `#cloud-run/${d.firebaseDocId}`,
      onDelete: () => this._delete(d.firebaseDocId),
    });
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

    /* ── Flow connector ── */
    .flow-connector {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      margin: -4px 0;
    }

    .flow-line {
      width: 1px;
      height: 12px;
      background: var(--border);
    }

    .flow-sync-row {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: center;
    }

    .btn-sync {
      font-family: var(--sans);
      font-size: 0.8125rem;
      font-weight: 500;
      padding: 7px 20px;
      border-radius: 6px;
      border: 1px solid var(--border);
      cursor: pointer;
      background: var(--fg);
      color: #09090b;
      transition: opacity 0.15s;
    }

    .btn-sync:hover:not(:disabled) { opacity: 0.88; }
    .btn-sync:disabled { opacity: 0.3; cursor: not-allowed; }

    .sync-status { font-family: var(--mono); font-size: 0.68rem; }
    .sync-status.listing,
    .sync-status.downloading { color: #a1a1aa; animation: blink 0.8s infinite; }
    .sync-status.done  { color: #22c55e; }
    .sync-status.error { color: #f87171; }

    .flow-auto-label {
      display: flex;
      align-items: center;
      gap: 5px;
      font-family: var(--mono);
      font-size: 0.65rem;
      color: #3f3f46;
      letter-spacing: 0.04em;
    }

    .flow-auto-label.uploading { color: #60a5fa; animation: blink 0.8s infinite; }
    .flow-auto-label.offline   { color: #f87171; }
    .flow-auto-label.idle      { color: #52525b; }

    @keyframes blink { 50% { opacity: 0.4; } }

    /* ── Runs list ── */
    .runs-list { display: flex; flex-direction: column; gap: 6px; }

    .run-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--fg);
    }

    .run-item--dimmed { opacity: 0.45; }

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

    .run-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

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

    .btn-sm:hover:not(.btn-disabled) { border-color: #72727a; color: var(--fg); }
    .btn-sm.btn-danger:hover          { border-color: #ef4444; color: #f87171; }
    .btn-sm.btn-disabled              { opacity: 0.25; cursor: default; pointer-events: none; }

    .empty-msg {
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--muted-fg);
      text-align: center;
      padding: 24px 0;
    }

    .info-msg {
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--muted-fg);
      text-align: center;
      padding: 20px 0;
    }

    .card-count {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: #52525b;
    }
  `;

  // ── Render ────────────────────────────────────────────────────────────

  render() {
    const busy         = this.syncStatus === 'listing' || this.syncStatus === 'downloading';
    const deviceRows   = this.deviceOnlyRuns;
    const localPending = this.runs.filter(r => !r.firebaseId);

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

          <!-- Device -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">Device</span>
              <span class="card-count">${deviceRows.length}</span>
            </div>
            ${deviceRows.length === 0
              ? html`<div class="empty-msg">All runs downloaded.</div>`
              : html`<div class="runs-list">${deviceRows.map(r => this._renderDeviceOnlyRun(r))}</div>`
            }
          </div>

          <!-- Sync connector -->
          <div class="flow-connector">
            <div class="flow-line"></div>
            <div class="flow-sync-row">
              <button class="btn-sync" ?disabled=${!this.connected || busy} @click=${this._sync}>
                ${busy ? 'Syncing…' : 'Sync to local'}
              </button>
              ${this.syncStatus !== 'idle' ? html`
                <span class="sync-status ${this.syncStatus}">
                  ${this.syncStatus === 'listing'     ? 'Listing…'
                  : this.syncStatus === 'downloading' ? `${this.syncProgress}`
                  : this.syncMsg}
                </span>
              ` : ''}
            </div>
            <div class="flow-line"></div>
          </div>

          <!-- Local (pending upload) -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">Local</span>
              <span class="card-count">${localPending.length}</span>
            </div>
            ${localPending.length === 0
              ? html`<div class="empty-msg">All local runs uploaded.</div>`
              : html`<div class="runs-list">${localPending.map(run => this._renderRun(run))}</div>`
            }
          </div>

          <!-- Auto-upload connector -->
          <div class="flow-connector">
            <div class="flow-line"></div>
            ${this._uploading ? html`
              <span class="flow-auto-label uploading">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
                </svg>
                uploading…
              </span>
            ` : !this._online ? html`
              <span class="flow-auto-label offline">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.35 10.04A7.49 7.49 0 0012 4c-1.48 0-2.85.43-4.01 1.17l1.46 1.46A5.497 5.497 0 0112 6c2.76 0 5 2.24 5 5v1h1c1.65 0 3 1.35 3 3 0 1.08-.59 2.01-1.45 2.52l1.45 1.45C22.16 18.07 23 16.64 23 15c0-2.64-2.05-4.78-4.65-4.96zM3 3.27L1.27 5 4.36 8.09A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h11.73l2 2L21 20.73 3 3.27zM7.73 10l8 8H6c-2.21 0-4-1.79-4-4 0-2.05 1.54-3.72 3.54-3.95L7.73 10z"/>
                </svg>
                no network
              </span>
            ` : html`
              <span class="flow-auto-label idle">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
                </svg>
                auto-upload
              </span>
            `}
            <div class="flow-line"></div>
          </div>

          <!-- Cloud (last 10) -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">Cloud</span>
              <span class="card-count">${this.allDocs.length}</span>
            </div>
            ${this.allDocs.length === 0 ? html`
              <p class="info-msg">${this.loadingAll ? 'Loading…' : 'No runs in cloud yet.'}</p>
            ` : html`
              <div class="runs-list">
                ${this.allDocs.map((d: CloudDoc) => this._renderCloudRow(d))}
              </div>
            `}
          </div>

        </div>
      </main>
    `;
  }
}
