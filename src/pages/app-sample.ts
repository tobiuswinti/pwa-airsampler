import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { getDeviceRuns, DeviceRun } from '../device-log-store';

// Minimal Web NFC type stubs
declare class NDEFReader extends EventTarget {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  onreading: ((event: NDEFReadingEvent) => void) | null;
}
declare interface NDEFReadingEvent extends Event { serialNumber: string; }

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

  @state() private nfcAvail   = 'NDEFReader' in window;
  @state() private scanning   = false;
  @state() private searching  = false;
  @state() private searched   = false;
  @state() private tagId      = '';
  @state() private errorMsg   = '';
  @state() private localResults:  DeviceRun[]  = [];
  @state() private cloudResults:  CloudDoc[]   = [];

  private _nfcAbort: AbortController | null = null;
  private _searchAbort: AbortController | null = null;

  disconnectedCallback() {
    super.disconnectedCallback();
    this._nfcAbort?.abort();
    this._searchAbort?.abort();
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
        this._search(e.serialNumber.toUpperCase());
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
      this.searched      = false;
      this.localResults  = [];
      this.cloudResults  = [];
      return;
    }
    // Debounce slightly so we don't fire on every keystroke
    const ac = new AbortController();
    this._searchAbort = ac;
    setTimeout(() => { if (!ac.signal.aborted) this._search(val); }, 300);
  }

  private async _search(raw: string) {
    const normalized = raw.trim().toUpperCase();
    this.tagId       = raw;
    this.searching   = true;
    this.searched    = false;
    this.localResults  = [];
    this.cloudResults  = [];

    // ── Local lookup ──────────────────────────────────────────────────────────
    const local = getDeviceRuns().filter(
      r => r.meta.tagId?.trim().toUpperCase() === normalized
    );
    const localIds = new Set(local.map(r => r.id));
    this.localResults = local;

    // ── Firebase lookup ───────────────────────────────────────────────────────
    try {
      const q   = query(collection(db, COLLECTION), where('tagId', '==', raw.trim()));
      const snap = await getDocs(q);
      const cloud: CloudDoc[] = [];
      snap.forEach(doc => {
        const d = doc.data();
        const devRunId: number = d['deviceRunId'];
        // Skip if already in local store
        if (localIds.has(devRunId)) return;
        const uploadedAt = d['uploadedAt'] instanceof Timestamp
          ? d['uploadedAt'].toMillis()
          : Number(d['uploadedAt'] ?? 0);
        cloud.push({
          firebaseDocId: doc.id,
          tagId:         d['tagId']        ?? '',
          startTime:     Number(d['startTime']    ?? 0),
          downloadedAt:  Number(d['downloadedAt'] ?? 0),
          uploadedAt,
          fields:        d['fields']       ?? [],
          meta:          d['meta']         ?? {},
        });
      });
      this.cloudResults = cloud;
    } catch (err) {
      // Cloud query failed (e.g. offline) — still show local results
      console.warn('[sample] cloud query failed:', err);
    }

    this.searching = false;
    this.searched  = true;
  }

  private _fmt(ms: number): string {
    return ms ? new Date(ms).toLocaleString() : '—';
  }

  static styles = css`
    :host {
      --bg:       #09090b;
      --card:     #09090b;
      --border:   #27272a;
      --fg:       #fafafa;
      --muted-fg: #71717a;
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

    /* Result card */
    .result-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }

    .result-card.local { border-color: rgba(34,197,94,0.25); }
    .result-card.cloud { border-color: rgba(59,130,246,0.25); }

    .result-header {
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      border-bottom: 1px solid var(--border);
    }

    .result-dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .result-dot.local { background: #22c55e; }
    .result-dot.cloud { background: #3b82f6; }

    .result-title { font-size: 0.875rem; font-weight: 600; }

    .result-badge {
      margin-left: auto;
      font-size: 0.6875rem;
      font-weight: 500;
      padding: 2px 7px;
      border-radius: 8px;
      flex-shrink: 0;
    }

    .result-badge.local { background: rgba(34,197,94,0.08); color: #22c55e; border: 1px solid rgba(34,197,94,0.2); }
    .result-badge.cloud { background: rgba(59,130,246,0.08); color: #60a5fa; border: 1px solid rgba(59,130,246,0.2); }

    .result-body {
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .info-row { display: flex; justify-content: space-between; gap: 8px; }
    .info-key { font-size: 0.8125rem; color: var(--muted-fg); }
    .info-val { font-size: 0.8125rem; color: var(--fg); text-align: right; font-family: var(--mono); }

    .result-actions {
      padding: 11px 16px;
      border-top: 1px solid var(--border);
    }

    .btn-view {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: var(--sans);
      font-size: 0.875rem;
      font-weight: 500;
      padding: 8px 20px;
      border-radius: 6px;
      background: var(--fg);
      color: #09090b;
      text-decoration: none;
      transition: opacity 0.15s;
    }

    .btn-view:hover { opacity: 0.88; }

    .unavail-msg {
      font-size: 0.8125rem;
      color: var(--muted-fg);
      text-align: center;
      padding: 8px 0;
      line-height: 1.6;
    }
  `;

  private _renderLocalResult(run: DeviceRun) {
    return html`
      <div class="result-card local">
        <div class="result-header">
          <span class="result-dot local"></span>
          <span class="result-title">${run.meta.tagId || `Run #${run.id}`}</span>
          <span class="result-badge local">On device</span>
        </div>
        <div class="result-body">
          ${run.meta.startTime ? html`
            <div class="info-row">
              <span class="info-key">Sampled</span>
              <span class="info-val">${this._fmt(run.meta.startTime)}</span>
            </div>` : ''}
          <div class="info-row">
            <span class="info-key">Downloaded</span>
            <span class="info-val">${this._fmt(run.downloadedAt)}</span>
          </div>
          ${run.meta.lat ? html`
            <div class="info-row">
              <span class="info-key">Location</span>
              <span class="info-val">${run.meta.lat}, ${run.meta.lon}</span>
            </div>` : ''}
          <div class="info-row">
            <span class="info-key">Fields</span>
            <span class="info-val">${run.fields.filter(f => f !== 'timestamp').join(', ')}</span>
          </div>
        </div>
        <div class="result-actions">
          <a class="btn-view" href="#run/${run.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
            </svg>
            View Run
          </a>
        </div>
      </div>
    `;
  }

  private _renderCloudResult(doc: CloudDoc) {
    return html`
      <div class="result-card cloud">
        <div class="result-header">
          <span class="result-dot cloud"></span>
          <span class="result-title">${doc.tagId || '—'}</span>
          <span class="result-badge cloud">Cloud only</span>
        </div>
        <div class="result-body">
          ${doc.startTime ? html`
            <div class="info-row">
              <span class="info-key">Sampled</span>
              <span class="info-val">${this._fmt(doc.startTime)}</span>
            </div>` : ''}
          <div class="info-row">
            <span class="info-key">Downloaded</span>
            <span class="info-val">${this._fmt(doc.downloadedAt)}</span>
          </div>
          <div class="info-row">
            <span class="info-key">Uploaded</span>
            <span class="info-val">${this._fmt(doc.uploadedAt)}</span>
          </div>
          ${doc.meta.lat ? html`
            <div class="info-row">
              <span class="info-key">Location</span>
              <span class="info-val">${doc.meta.lat}, ${doc.meta.lon}</span>
            </div>` : ''}
          <div class="info-row">
            <span class="info-key">Fields</span>
            <span class="info-val">${doc.fields.filter(f => f !== 'timestamp').join(', ')}</span>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    const totalResults = this.localResults.length + this.cloudResults.length;

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

          <!-- Results -->
          ${this.searching ? html`
            <p class="searching-msg">Searching…</p>
          ` : this.searched ? html`
            <span class="results-label">
              ${totalResults === 0 ? 'No results' : `${totalResults} result${totalResults > 1 ? 's' : ''}`}
            </span>
            ${totalResults === 0 ? html`
              <div class="no-results">
                No run found for tag <strong>${this.tagId}</strong>.<br>
                Try syncing logs from the device first.
              </div>
            ` : html`
              ${this.localResults.map(r => this._renderLocalResult(r))}
              ${this.cloudResults.map(d => this._renderCloudResult(d))}
            `}
          ` : ''}

        </div>
      </main>
    `;
  }
}
