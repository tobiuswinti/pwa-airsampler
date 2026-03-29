import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import { DeviceRun, getDeviceRuns, onDeviceRunsChanged } from '../device-log-store';
import {
  collection, query, where, getDocs, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

// ── Web NFC stubs ──────────────────────────────────────────────────────────
declare class NDEFReader extends EventTarget {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  onreading: ((event: NDEFReadingEvent) => void) | null;
}
declare interface NDEFRecord { recordType: string; data?: DataView; }
declare interface NDEFMessage { records: NDEFRecord[]; }
declare interface NDEFReadingEvent extends Event { serialNumber: string; message: NDEFMessage; }

function tagIdFromNfc(e: NDEFReadingEvent): string {
  return e.serialNumber.toUpperCase();
}

// ── Types ──────────────────────────────────────────────────────────────────
interface CloudDoc {
  firebaseDocId: string;
  tagId: string;
  startTime: number;
  uploadedAt: number;
  deviceName: string;
}

const COLLECTION = 'device_runs';

@customElement('app-lookup')
export class AppLookup extends LitElement {

  @state() private tagId      = '';
  @state() private nfcAvail   = 'NDEFReader' in window;
  @state() private scanning   = false;
  @state() private searching  = false;
  @state() private searched   = false;

  @state() private allRuns: DeviceRun[]     = getDeviceRuns();
  @state() private localResults: DeviceRun[] = [];
  @state() private cloudResults: CloudDoc[]  = [];

  private _nfcAbort:    AbortController | null = null;
  private _searchAbort: AbortController | null = null;
  private _unsub?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this._unsub = onDeviceRunsChanged(() => {
      this.allRuns = getDeviceRuns();
      if (this.searched) this._applyLocalFilter(this.tagId);
    });
    if (this.nfcAvail) this._startScan();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsub?.();
    this._nfcAbort?.abort();
    this._searchAbort?.abort();
  }

  // ── NFC ───────────────────────────────────────────────────────────────

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

  // ── Search ────────────────────────────────────────────────────────────

  private _onInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    this.tagId = val;
    this._searchAbort?.abort();
    if (!val.trim()) { this._clear(); return; }
    const ac = new AbortController();
    this._searchAbort = ac;
    setTimeout(() => { if (!ac.signal.aborted) this._search(val); }, 300);
  }

  private async _search(raw: string) {
    const tag = raw.trim();
    this.tagId = raw;
    this.searching = true;
    this.searched  = false;
    this.localResults  = [];
    this.cloudResults  = [];
    this._applyLocalFilter(tag);
    try {
      const snap = await getDocs(query(collection(db, COLLECTION), where('tagId', '==', tag)));
      this.cloudResults = snap.docs.map(d => this._toCloudDoc(d.id, d.data()));
    } catch { /* ignore */ }
    this.searching = false;
    this.searched  = true;
  }

  private _applyLocalFilter(tag: string) {
    const upper = tag.toUpperCase();
    this.localResults = this.allRuns.filter(r => r.meta?.tagId?.toUpperCase() === upper);
  }

  private _clear() {
    this._stopScan();
    this._searchAbort?.abort();
    this.tagId = '';
    this.searched = false;
    this.localResults = [];
    this.cloudResults = [];
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private _toCloudDoc(id: string, d: Record<string, unknown>): CloudDoc {
    const uploadedAt = d['uploadedAt'] instanceof Timestamp
      ? d['uploadedAt'].toMillis() : Number(d['uploadedAt'] ?? 0);
    const rawStart = Number(d['startTime'] ?? 0);
    return {
      firebaseDocId: id,
      tagId:      String(d['tagId']      ?? ''),
      deviceName: String(d['deviceName'] ?? ''),
      startTime:  rawStart < 1e12 ? rawStart * 1000 : rawStart,
      uploadedAt,
    };
  }

  private _fmtDate(ms: number) {
    if (!ms) return '—';
    return new Date(ms).toLocaleString([], {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
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

    .page-title { font-size: 0.875rem; font-weight: 600; color: var(--fg); }

    .content {
      width: 100%;
      max-width: 560px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    /* ── Search bar ── */
    .search-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px 16px;
    }

    .search-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .tag-input {
      flex: 1;
      background: #09090b;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 9px 12px;
      font-family: var(--mono);
      font-size: 0.8125rem;
      color: var(--fg);
      outline: none;
      transition: border-color 0.15s;
      min-width: 0;
    }

    .tag-input:focus { border-color: #72727a; }
    .tag-input::placeholder { color: #52525b; }

    .btn-icon {
      display: flex; align-items: center; justify-content: center;
      width: 36px; height: 36px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted-fg);
      cursor: pointer;
      flex-shrink: 0;
      font-size: 0.9rem;
      transition: border-color 0.15s, color 0.15s;
    }

    .btn-icon:hover { border-color: #72727a; color: var(--fg); }
    .btn-icon.scanning { border-color: #3b82f6; color: #60a5fa; }

    /* ── NFC widget ── */
    .nfc-widget {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      padding: 24px 0 8px;
    }

    .nfc-ring {
      width: 88px; height: 88px;
      border-radius: 50%;
      border: 2px solid #3f3f46;
      background: #111113;
      display: flex; align-items: center; justify-content: center;
      transition: border-color 0.3s;
      cursor: pointer;
    }

    .nfc-ring.scanning {
      border-color: #3b82f6;
      animation: nfc-pulse 1.5s ease-in-out infinite;
    }

    @keyframes nfc-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.45); }
      50%       { box-shadow: 0 0 0 18px rgba(59,130,246,0); }
    }

    .nfc-ring-label {
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--muted-fg);
    }

    .nfc-ring-label.active { color: #60a5fa; }

    /* ── Results sections ── */
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }

    .section-title {
      font-size: 0.75rem;
      font-weight: 500;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--muted-fg);
    }

    .section-count {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: #52525b;
    }

    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px 18px;
    }

    /* ── Run rows ── */
    .run-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 0;
      border-bottom: 1px solid #27272a;
    }

    .run-row:last-child { border-bottom: none; }

    .run-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }

    .run-name {
      font-size: 0.8125rem;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .run-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }

    .run-device {
      font-family: var(--mono);
      font-size: 0.65rem;
      color: #60a5fa;
    }

    .run-date { font-family: var(--mono); font-size: 0.65rem; color: var(--muted-fg); }

    .run-badge {
      font-family: var(--mono);
      font-size: 0.65rem;
      padding: 2px 7px;
      border-radius: 4px;
      flex-shrink: 0;
    }

    .run-badge.cloud  { color: #22c55e; background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); }
    .run-badge.local  { color: #f59e0b; background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.2); }
    .run-badge.error  { color: #f87171; background: rgba(239,68,68,0.08);  border: 1px solid rgba(239,68,68,0.2); }

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

    .btn-sm:hover { border-color: #72727a; color: var(--fg); }

    /* ── States ── */
    .empty-msg {
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--muted-fg);
      text-align: center;
      padding: 20px 0;
    }

    .prompt-msg {
      font-family: var(--mono);
      font-size: 0.75rem;
      color: #3f3f46;
      text-align: center;
      padding: 32px 0 8px;
    }
  `;

  // ── Render ────────────────────────────────────────────────────────────

  render() {
    const tag = this.tagId.trim();

    return html`
      <main>
        <div class="page-header">
          <a class="back-btn" href="${resolveRouterPath()}">←</a>
          <span class="page-title">Tag Lookup</span>
        </div>

        <div class="content">

          <!-- Search bar -->
          <div class="search-card">
            <div class="search-row">
              <input
                class="tag-input"
                type="text"
                placeholder="Tag ID…"
                .value=${this.tagId}
                @input=${this._onInput}
              />
              ${this.tagId ? html`
                <button class="btn-icon" title="Clear" @click=${this._clear}>✕</button>
              ` : this.nfcAvail ? html`
                <button class="btn-icon ${this.scanning ? 'scanning' : ''}"
                  title="${this.scanning ? 'Stop scanning' : 'Scan NFC tag'}"
                  @click=${this.scanning ? this._stopScan : this._startScan}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
                    <path d="M6 15h2v-2H6v2zm0-4h2V9H6v2zm0-4h2V5H6v2zm4 8h2v-2h-2v2zm0-4h2V9h-2v2zm0-4h2V5h-2v2zm4 8h2v-2h-2v2zm0-4h2V9h-2v2zm0-4h2V5h-2v2z"/>
                  </svg>
                </button>
              ` : ''}
            </div>

            ${!this.tagId && this.nfcAvail ? html`
              <div class="nfc-widget">
                <div class="nfc-ring ${this.scanning ? 'scanning' : ''}"
                  @click=${this.scanning ? this._stopScan : this._startScan}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="${this.scanning ? '#60a5fa' : '#52525b'}">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
                    <path d="M6 15h2v-2H6v2zm0-4h2V9H6v2zm0-4h2V5H6v2zm4 8h2v-2h-2v2zm0-4h2V9h-2v2zm0-4h2V5h-2v2zm4 8h2v-2h-2v2zm0-4h2V9h-2v2zm0-4h2V5h-2v2z"/>
                  </svg>
                </div>
                <span class="nfc-ring-label ${this.scanning ? 'active' : ''}">
                  ${this.scanning ? 'Hold tag near phone…' : 'Tap to scan NFC tag'}
                </span>
              </div>
            ` : ''}
          </div>

          ${!this.searched && !this.searching ? html`
            <p class="prompt-msg">Scan a tag or type a tag ID to find runs.</p>
          ` : this.searching ? html`
            <p class="prompt-msg">Searching…</p>
          ` : html`

            <!-- Local results -->
            <div class="card">
              <div class="section-header">
                <span class="section-title">Local</span>
                <span class="section-count">${this.localResults.length}</span>
              </div>
              ${this.localResults.length === 0
                ? html`<div class="empty-msg">No local run with tag "${tag}".</div>`
                : this.localResults.map(run => {
                    const badge = run.firebaseId ? 'cloud'
                      : run.uploadError ? 'error' : 'local';
                    const badgeLabel = run.firebaseId ? 'in cloud'
                      : run.uploadError ? 'upload error' : 'pending upload';
                    return html`
                      <div class="run-row">
                        <div class="run-info">
                          <span class="run-name">${run.meta?.tagId || `Run #${run.id}`}</span>
                          <div class="run-meta">
                            ${run.meta?.deviceName ? html`<span class="run-device">${run.meta.deviceName}</span>` : ''}
                            <span class="run-date">${this._fmtDate(run.meta.startTime)}</span>
                          </div>
                        </div>
                        <span class="run-badge ${badge}">${badgeLabel}</span>
                        <a class="btn-sm" href="#run/${run.id}">View</a>
                      </div>`;
                  })
              }
            </div>

            <!-- Cloud results -->
            <div class="card">
              <div class="section-header">
                <span class="section-title">Cloud</span>
                <span class="section-count">${this.cloudResults.length}</span>
              </div>
              ${this.cloudResults.length === 0
                ? html`<div class="empty-msg">No cloud run with tag "${tag}".</div>`
                : this.cloudResults.map(d => html`
                    <div class="run-row">
                      <div class="run-info">
                        <span class="run-name">${d.tagId || d.firebaseDocId.slice(0, 8)}</span>
                        <div class="run-meta">
                          ${d.deviceName ? html`<span class="run-device">${d.deviceName}</span>` : ''}
                          <span class="run-date">${this._fmtDate(d.startTime)}</span>
                        </div>
                      </div>
                      <a class="btn-sm" href="#cloud-run/${d.firebaseDocId}">View</a>
                    </div>
                  `)
              }
            </div>

          `}

        </div>
      </main>
    `;
  }
}
