import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { collection, query, where, getDocs, deleteDoc, doc, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { getDeviceRuns } from '../device-log-store';

// Minimal Web NFC type stubs
declare class NDEFReader extends EventTarget {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  onreading: ((event: NDEFReadingEvent) => void) | null;
}
declare interface NDEFRecord { recordType: string; encoding?: string; data: DataView; }
declare interface NDEFMessage { records: NDEFRecord[]; }
declare interface NDEFReadingEvent extends Event { serialNumber: string; message: NDEFMessage; }

interface CloudDoc {
  firebaseDocId: string;
  tagId:         string;
  startTime:     number;
  downloadedAt:  number;
  uploadedAt:    number;
  fields:        string[];
  meta:          { lat?: string; lon?: string };
}

const COLLECTION = 'device_runs';

@customElement('app-sample')
export class AppSample extends LitElement {

  @state() private nfcAvail     = 'NDEFReader' in window;
  @state() private scanning     = false;
  @state() private searching    = false;
  @state() private searched     = false;
  @state() private tagId        = '';
  @state() private errorMsg     = '';
  @state() private cloudResults: CloudDoc[] = [];
  @state() private allDocs:      CloudDoc[] = [];
  @state() private loadingAll   = true;
  @state() private loadError    = '';

  private _nfcAbort: AbortController | null = null;
  private _searchAbort: AbortController | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._loadAll();
    if (this.nfcAvail) this._startScan();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._nfcAbort?.abort();
    this._searchAbort?.abort();
  }

  private async _loadAll() {
    this.loadingAll = true;
    this.loadError  = '';
    try {
      const q    = query(collection(db, COLLECTION), orderBy('startTime', 'desc'));
      const snap = await getDocs(q);
      this.allDocs = snap.docs.map(d => this._docToCloudDoc(d.id, d.data()));
    } catch (err: any) {
      this.loadError = err?.message ?? 'Failed to load cloud runs';
    } finally {
      this.loadingAll = false;
    }
  }

  private _docToCloudDoc(id: string, d: Record<string, any>): CloudDoc {
    const uploadedAt = d['uploadedAt'] instanceof Timestamp
      ? d['uploadedAt'].toMillis()
      : Number(d['uploadedAt'] ?? 0);
    return {
      firebaseDocId: id,
      tagId:         d['tagId']        ?? '',
      startTime:     Number(d['startTime']    ?? 0),
      downloadedAt:  Number(d['downloadedAt'] ?? 0),
      uploadedAt,
      fields:        d['fields']       ?? [],
      meta:          d['meta']         ?? {},
    };
  }

  private async _delete(docId: string) {
    try {
      await deleteDoc(doc(db, COLLECTION, docId));
      this.allDocs     = this.allDocs.filter(d => d.firebaseDocId !== docId);
      this.cloudResults = this.cloudResults.filter(d => d.firebaseDocId !== docId);
    } catch (err: any) {
      console.warn('[sample] delete failed:', err);
    }
  }

  private async _startScan() {
    this._nfcAbort?.abort();
    this._nfcAbort = new AbortController();
    this.scanning  = true;
    this.errorMsg  = '';

    try {
      const reader = new (window as any).NDEFReader() as NDEFReader;
      reader.onreading = (e: NDEFReadingEvent) => {
        this._nfcAbort?.abort();
        this._nfcAbort = null;
        this.scanning  = false;
        const id = e.serialNumber ?? '';
        this._search(id.toUpperCase());
      };
      await reader.scan({ signal: this._nfcAbort.signal });
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      this.scanning  = false;
      this.errorMsg  = err?.message ?? 'NFC scan failed';
    }
  }

  private _stopScan() {
    this._nfcAbort?.abort();
    this._nfcAbort = null;
    this.scanning  = false;
  }

  private _onInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    this.tagId = val;
    this._searchAbort?.abort();
    if (!val.trim()) {
      this.searched     = false;
      this.cloudResults = [];
      return;
    }
    // Debounce slightly so we don't fire on every keystroke
    const ac = new AbortController();
    this._searchAbort = ac;
    setTimeout(() => { if (!ac.signal.aborted) this._search(val); }, 300);
  }

  private async _search(raw: string) {
    this.tagId        = raw;
    this.searching    = true;
    this.searched     = false;
    this.cloudResults = [];

    const tag = raw.trim();

    // Local runs matching this tag
    const localMatches = getDeviceRuns().filter(
      r => (r.meta?.tagId ?? '').toUpperCase() === tag.toUpperCase()
    );

    try {
      const q    = query(collection(db, COLLECTION), where('tagId', '==', tag));
      const snap = await getDocs(q);
      this.cloudResults = snap.docs.map(d => this._docToCloudDoc(d.id, d.data()));
    } catch (err) {
      console.warn('[sample] cloud query failed:', err);
    }

    this.searching = false;
    this.searched  = true;

    // Auto-navigate when there's exactly one match total (cloud preferred)
    const cloudCount = this.cloudResults.length;
    const localCount = localMatches.length;
    if (cloudCount === 1 && localCount === 0) {
      window.location.hash = `#cloud-run/${this.cloudResults[0].firebaseDocId}`;
    } else if (cloudCount === 0 && localCount === 1) {
      window.location.hash = `#run/${localMatches[0].id}`;
    } else if (cloudCount >= 1 && localCount >= 1) {
      // Cloud preferred — pick the most recent cloud result
      const best = this.cloudResults.reduce((a, b) => a.startTime > b.startTime ? a : b);
      window.location.hash = `#cloud-run/${best.firebaseDocId}`;
    }
  }

  private _fmt(ms: number): string {
    return ms ? new Date(ms).toLocaleString() : '—';
  }

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

    .back-btn:hover { color: var(--fg); border-color: #52525b; }

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

    /* NFC area */
    .scan-area {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 4px 0 8px;
    }

    .nfc-icon {
      width: 56px; height: 56px;
      border-radius: 50%;
      border: 1.5px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: border-color 0.2s;
    }

    .nfc-icon.scanning {
      border-color: #3b82f6;
      animation: nfc-pulse 1.5s ease-in-out infinite;
    }

    @keyframes nfc-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.35); }
      50%       { box-shadow: 0 0 0 10px rgba(59,130,246,0); }
    }

    .scan-label {
      font-size: 0.8125rem;
      color: var(--muted-fg);
      text-align: center;
    }

    .scan-label.scanning { color: #60a5fa; }

    .btn-row { display: flex; gap: 8px; justify-content: center; }

    .btn {
      font-family: var(--sans);
      font-size: 0.875rem;
      font-weight: 500;
      padding: 9px 24px;
      border-radius: 6px;
      cursor: pointer;
      transition: opacity 0.15s;
    }

    .btn-primary { background: var(--fg); color: #09090b; border: none; }
    .btn-primary:hover { opacity: 0.88; }

    .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--muted-fg); }
    .btn-outline:hover { border-color: #52525b; color: var(--fg); }

    .error-msg { font-size: 0.75rem; color: #f87171; text-align: center; }

    /* Input */
    .tag-input {
      width: 100%;
      background: #09090b;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 9px 12px;
      font-family: var(--mono);
      font-size: 0.8125rem;
      color: var(--fg);
      outline: none;
      transition: border-color 0.15s;
    }

    .tag-input:focus { border-color: #52525b; }
    .tag-input::placeholder { color: #3f3f46; }

    /* Results section */
    .results-label {
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--muted-fg);
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .searching-msg {
      font-size: 0.8125rem;
      color: var(--muted-fg);
      text-align: center;
      padding: 4px 0;
    }

    .no-results {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px 18px;
      font-size: 0.8125rem;
      color: var(--muted-fg);
      text-align: center;
      line-height: 1.6;
    }

    /* Compact cloud run row */
    .run-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 11px 0;
      border-bottom: 1px solid var(--border);
    }

    .run-row:last-child { border-bottom: none; }

    .run-row-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .run-row-name {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--fg);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .run-row-date {
      font-family: var(--mono);
      font-size: 0.65rem;
      color: var(--muted-fg);
    }

    .btn-delete {
      font-family: var(--sans);
      font-size: 0.75rem;
      font-weight: 500;
      padding: 5px 12px;
      border-radius: 5px;
      cursor: pointer;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--muted-fg);
      transition: border-color 0.15s, color 0.15s;
      flex-shrink: 0;
    }

    .btn-delete:hover { border-color: #ef4444; color: #f87171; }

    .btn-view-sm {
      font-family: var(--sans);
      font-size: 0.75rem;
      font-weight: 500;
      padding: 5px 12px;
      border-radius: 5px;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--muted-fg);
      text-decoration: none;
      transition: border-color 0.15s, color 0.15s;
      flex-shrink: 0;
    }

    .btn-view-sm:hover { border-color: #52525b; color: var(--fg); }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .loading-msg {
      font-size: 0.8125rem;
      color: var(--muted-fg);
      text-align: center;
      padding: 4px 0;
    }

    .unavail-msg {
      font-size: 0.8125rem;
      color: var(--muted-fg);
      text-align: center;
      padding: 8px 0;
      line-height: 1.6;
    }
  `;

  private _renderCloudResult(d: CloudDoc) {
    const name = d.tagId || '—';
    const date = d.startTime ? this._fmt(d.startTime) : d.uploadedAt ? this._fmt(d.uploadedAt) : '—';
    return html`
      <div class="run-row">
        <div class="run-row-info">
          <span class="run-row-name">${name}</span>
          <span class="run-row-date">${date}</span>
        </div>
        <a class="btn-view-sm" href="#cloud-run/${d.firebaseDocId}">View</a>
        <button class="btn-delete" @click=${() => this._delete(d.firebaseDocId)}>Delete</button>
      </div>
    `;
  }

  render() {
    const count = this.cloudResults.length;

    return html`
      <main>
        <div class="page-header">
          <a class="back-btn" href="#">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12l4.58-4.59z"/>
            </svg>
          </a>
          <span class="page-title">Sample Lookup</span>
        </div>

        <div class="content">

          <!-- NFC Scan -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">Scan RFID Tag</span>
            </div>

            ${this.nfcAvail ? html`
              <div class="scan-area">
                <div class="nfc-icon ${this.scanning ? 'scanning' : ''}">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="${this.scanning ? '#60a5fa' : '#52525b'}">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
                    <path d="M6 15h2v-2H6v2zm0-4h2V9H6v2zm0-4h2V5H6v2zm4 8h2v-2h-2v2zm0-4h2V9h-2v2zm0-4h2V5h-2v2zm4 8h2v-2h-2v2zm0-4h2V9h-2v2zm0-4h2V5h-2v2z"/>
                  </svg>
                </div>

                <span class="scan-label ${this.scanning ? 'scanning' : ''}">
                  ${this.scanning ? 'Hold RFID tag near the device…' : 'Tap "Scan" then hold your RFID tag near the device'}
                </span>

                ${this.errorMsg ? html`<span class="error-msg">${this.errorMsg}</span>` : ''}

                <div class="btn-row">
                  ${this.scanning
                    ? html`<button class="btn btn-outline" @click=${() => this._stopScan()}>Stop</button>`
                    : html`<button class="btn btn-primary" @click=${() => this._startScan()}>Scan</button>`}
                </div>
              </div>
            ` : html`
              <p class="unavail-msg">NFC is not available in this browser.<br>Use the manual input below.</p>
            `}
          </div>

          <!-- Manual input -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">Manual Entry</span>
            </div>
            <input
              class="tag-input"
              type="text"
              placeholder="e.g. A1B2C3D4"
              .value=${this.tagId}
              @input=${this._onInput}
            />
          </div>

          <!-- Tag search results -->
          ${this.searching ? html`
            <p class="searching-msg">Searching…</p>
          ` : this.searched ? html`
            <div class="card">
              <div class="card-header">
                <span class="card-title">
                  ${count === 0 ? 'No results' : `${count} result${count > 1 ? 's' : ''} for tag`}
                </span>
              </div>
              ${count === 0 ? html`
                <p class="searching-msg">No cloud run found for tag <strong>${this.tagId}</strong>.</p>
              ` : this.cloudResults.map(d => this._renderCloudResult(d))}
            </div>
          ` : ''}

          <!-- All cloud runs -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">All Cloud Runs (${this.allDocs.length})</span>
            </div>
            ${this.loadingAll ? html`
              <p class="loading-msg">Loading…</p>
            ` : this.loadError ? html`
              <p class="searching-msg">${this.loadError}</p>
            ` : this.allDocs.length === 0 ? html`
              <p class="searching-msg">No runs uploaded to cloud yet.</p>
            ` : this.allDocs.map(d => this._renderCloudResult(d))}
          </div>

        </div>
      </main>
    `;
  }
}
