import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { getDeviceRuns, DeviceRun } from '../device-log-store';

// Minimal Web NFC type stubs
declare class NDEFReader extends EventTarget {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  onreading: ((event: NDEFReadingEvent) => void) | null;
}
declare interface NDEFReadingEvent extends Event {
  serialNumber: string;
  message: NDEFMessage;
}
declare interface NDEFMessage { records: NDEFRecord[]; }
declare interface NDEFRecord { recordType: string; data?: DataView; }

type ScanState = 'idle' | 'scanning' | 'found' | 'notfound' | 'error' | 'unavailable';

@customElement('app-sample')
export class AppSample extends LitElement {

  @state() private scanState: ScanState = 'idle';
  @state() private tagId = '';
  @state() private foundRun: DeviceRun | null = null;
  @state() private errorMsg = '';

  private _abort: AbortController | null = null;

  connectedCallback() {
    super.connectedCallback();
    if (!('NDEFReader' in window)) {
      this.scanState = 'unavailable';
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._abort?.abort();
  }

  private async _startScan() {
    this._abort?.abort();
    this._abort = new AbortController();
    this.scanState = 'scanning';
    this.tagId = '';
    this.foundRun = null;
    this.errorMsg = '';

    try {
      const reader = new (window as any).NDEFReader() as NDEFReader;
      reader.onreading = (e: NDEFReadingEvent) => {
        const id = e.serialNumber.toUpperCase();
        this._lookup(id);
      };
      await reader.scan({ signal: this._abort.signal });
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      this.scanState = 'error';
      this.errorMsg = err?.message ?? 'NFC scan failed';
    }
  }

  private _stopScan() {
    this._abort?.abort();
    this._abort = null;
    if (this.scanState === 'scanning') this.scanState = 'idle';
  }

  private _lookup(id: string) {
    this.tagId = id;
    this._abort?.abort();
    this._abort = null;

    const normalized = id.trim().toUpperCase();
    const run = getDeviceRuns().find(
      r => r.meta.tagId?.trim().toUpperCase() === normalized
    ) ?? null;

    this.foundRun = run;
    this.scanState = run ? 'found' : 'notfound';
  }

  private _onInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    this.tagId = val;
    if (val.trim()) this._lookup(val);
    else {
      this.foundRun = null;
      this.scanState = 'idle';
    }
  }

  private _formatDate(ms: number): string {
    return new Date(ms).toLocaleString();
  }

  static styles = css`
    :host {
      --bg:       #09090b;
      --card:     #18181b;
      --border:   #27272a;
      --fg:       #fafafa;
      --muted-fg: #71717a;
      --sans: 'Geist', 'Inter', system-ui, sans-serif;
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
      max-width: 480px;
      padding: 20px 20px 4px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .back-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px; height: 32px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted-fg);
      cursor: pointer;
      text-decoration: none;
      flex-shrink: 0;
      transition: border-color 0.15s, color 0.15s;
    }

    .back-btn:hover { border-color: #3f3f46; color: var(--fg); }

    .page-title {
      font-size: 1rem;
      font-weight: 600;
    }

    .content {
      width: 100%;
      max-width: 480px;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .card-title {
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--muted-fg);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    /* NFC scan button */
    .scan-area {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 8px 0;
    }

    .nfc-icon {
      width: 64px; height: 64px;
      border-radius: 50%;
      border: 2px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: border-color 0.2s;
    }

    .nfc-icon.scanning {
      border-color: #3b82f6;
      animation: nfc-pulse 1.5s ease-in-out infinite;
    }

    .nfc-icon.found    { border-color: #22c55e; }
    .nfc-icon.notfound { border-color: #ef4444; }

    @keyframes nfc-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.4); }
      50%       { box-shadow: 0 0 0 12px rgba(59,130,246,0); }
    }

    .scan-status {
      font-size: 0.875rem;
      color: var(--muted-fg);
      text-align: center;
    }

    .scan-status.scanning { color: #60a5fa; }
    .scan-status.found    { color: #22c55e; }
    .scan-status.notfound { color: #ef4444; }
    .scan-status.error    { color: #ef4444; }

    .btn-row {
      display: flex;
      gap: 8px;
      justify-content: center;
    }

    .btn {
      font-family: var(--sans);
      font-size: 0.875rem;
      font-weight: 500;
      padding: 8px 20px;
      border-radius: 7px;
      cursor: pointer;
      transition: opacity 0.15s;
    }

    .btn-primary {
      background: var(--fg);
      color: #09090b;
      border: none;
    }

    .btn-primary:hover { opacity: 0.88; }

    .btn-outline {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--muted-fg);
    }

    .btn-outline:hover { border-color: #3f3f46; color: var(--fg); }

    /* Manual input */
    .input-row {
      display: flex;
      gap: 8px;
    }

    .tag-input {
      flex: 1;
      background: #09090b;
      border: 1px solid var(--border);
      border-radius: 7px;
      padding: 9px 12px;
      font-family: 'Share Tech Mono', monospace;
      font-size: 0.875rem;
      color: var(--fg);
      outline: none;
      transition: border-color 0.15s;
    }

    .tag-input:focus { border-color: #3f3f46; }
    .tag-input::placeholder { color: #3f3f46; }

    /* Result card */
    .result-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
    }

    .result-card.found   { border-color: rgba(34,197,94,0.3); }
    .result-card.notfound { border-color: rgba(239,68,68,0.2); }

    .result-header {
      padding: 14px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      border-bottom: 1px solid var(--border);
    }

    .result-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .result-dot.found    { background: #22c55e; }
    .result-dot.notfound { background: #ef4444; }

    .result-title {
      font-size: 0.9375rem;
      font-weight: 600;
    }

    .result-tag {
      font-family: 'Share Tech Mono', monospace;
      font-size: 0.75rem;
      color: var(--muted-fg);
      margin-left: auto;
    }

    .result-body {
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }

    .info-key {
      font-size: 0.8125rem;
      color: var(--muted-fg);
    }

    .info-val {
      font-size: 0.8125rem;
      color: var(--fg);
      text-align: right;
    }

    .result-actions {
      padding: 12px 16px;
      border-top: 1px solid var(--border);
    }

    .btn-view {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: var(--sans);
      font-size: 0.875rem;
      font-weight: 500;
      padding: 9px 20px;
      border-radius: 7px;
      background: var(--fg);
      color: #09090b;
      text-decoration: none;
      transition: opacity 0.15s;
    }

    .btn-view:hover { opacity: 0.88; }

    .unavail-msg {
      font-size: 0.875rem;
      color: var(--muted-fg);
      text-align: center;
      padding: 8px 0;
      line-height: 1.6;
    }
  `;

  render() {
    const nfcAvail = this.scanState !== 'unavailable';

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
            <span class="card-title">Scan RFID Tag</span>

            ${nfcAvail ? html`
              <div class="scan-area">
                <div class="nfc-icon ${this.scanState === 'scanning' ? 'scanning' : this.scanState === 'found' ? 'found' : this.scanState === 'notfound' ? 'notfound' : ''}">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="${this.scanState === 'found' ? '#22c55e' : this.scanState === 'notfound' ? '#ef4444' : this.scanState === 'scanning' ? '#60a5fa' : '#52525b'}">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
                    <path d="M6 15h2v-2H6v2zm0-4h2V9H6v2zm0-4h2V5H6v2zm4 8h2v-2h-2v2zm0-4h2V9h-2v2zm0-4h2V5h-2v2zm4 8h2v-2h-2v2zm0-4h2V9h-2v2zm0-4h2V5h-2v2z"/>
                  </svg>
                </div>

                <span class="scan-status ${this.scanState}">
                  ${this.scanState === 'idle'      ? 'Tap "Scan" then hold your RFID tag near the device'
                  : this.scanState === 'scanning'  ? 'Hold RFID tag near the device…'
                  : this.scanState === 'found'     ? `Tag found: ${this.tagId}`
                  : this.scanState === 'notfound'  ? `No run for tag: ${this.tagId}`
                  : this.scanState === 'error'     ? this.errorMsg
                  : ''}
                </span>

                <div class="btn-row">
                  ${this.scanState === 'scanning'
                    ? html`<button class="btn btn-outline" @click=${() => this._stopScan()}>Stop</button>`
                    : html`<button class="btn btn-primary" @click=${() => this._startScan()}>Scan</button>`
                  }
                </div>
              </div>
            ` : html`
              <p class="unavail-msg">NFC is not available in this browser.<br>Use the manual input below.</p>
            `}
          </div>

          <!-- Manual input -->
          <div class="card">
            <span class="card-title">Manual Entry</span>
            <div class="input-row">
              <input
                class="tag-input"
                type="text"
                placeholder="e.g. A1B2C3D4"
                .value=${this.tagId}
                @input=${this._onInput}
              />
            </div>
          </div>

          <!-- Result -->
          ${this.scanState === 'found' && this.foundRun ? html`
            <div class="result-card found">
              <div class="result-header">
                <span class="result-dot found"></span>
                <span class="result-title">${this.foundRun.meta.tagId || `Run #${this.foundRun.id}`}</span>
                <span class="result-tag">${this.tagId}</span>
              </div>
              <div class="result-body">
                ${this.foundRun.meta.startTime ? html`
                  <div class="info-row">
                    <span class="info-key">Sampled</span>
                    <span class="info-val">${this._formatDate(this.foundRun.meta.startTime)}</span>
                  </div>` : ''}
                <div class="info-row">
                  <span class="info-key">Downloaded</span>
                  <span class="info-val">${this._formatDate(this.foundRun.downloadedAt)}</span>
                </div>
                ${this.foundRun.meta.lat ? html`
                  <div class="info-row">
                    <span class="info-key">Location</span>
                    <span class="info-val">${this.foundRun.meta.lat}, ${this.foundRun.meta.lon}</span>
                  </div>` : ''}
                <div class="info-row">
                  <span class="info-key">Fields</span>
                  <span class="info-val">${this.foundRun.fields.filter(f => f !== 'timestamp').join(', ')}</span>
                </div>
              </div>
              <div class="result-actions">
                <a class="btn-view" href="#run/${this.foundRun.id}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                  </svg>
                  View Run
                </a>
              </div>
            </div>
          ` : this.scanState === 'notfound' ? html`
            <div class="result-card notfound">
              <div class="result-header">
                <span class="result-dot notfound"></span>
                <span class="result-title">No run found</span>
                <span class="result-tag">${this.tagId}</span>
              </div>
              <div class="result-body">
                <span class="info-key">No downloaded run is associated with this tag ID. Try syncing logs from the device first.</span>
              </div>
            </div>
          ` : ''}

        </div>
      </main>
    `;
  }
}
