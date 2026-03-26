import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import { getLastRfidTag } from '../log-store';
import { bleService } from '../ble-service';

type StepStatus = 'idle' | 'running' | 'ok' | 'error';

@customElement('app-control')
export class AppControl extends LitElement {

  @state() private connected = bleService.connStatus === 'connected';

  @state() private tagId     = '';
  @state() private lat       = '';
  @state() private lon       = '';
  @state() private flowrateSP = '1.0';
  @state() private durationH  = '1';
  @state() private delayH     = '';

  @state() private nfcScanning  = false;
  @state() private nfcAvailable = false;
  @state() private nfcError     = '';

  @state() private gpsLoading = false;

  @state() private stepTag:      StepStatus = 'idle';
  @state() private stepLocation: StepStatus = 'idle';
  @state() private stepSampling: StepStatus = 'idle';
  @state() private stepError = '';
  @state() private flowRunning = false;

  private nfcAbort: AbortController | null = null;
  private _onStatus = () => { this.connected = bleService.connStatus === 'connected'; };

  connectedCallback() {
    super.connectedCallback();
    bleService.addEventListener('status-changed', this._onStatus);
    if ('NDEFReader' in window) this.nfcAvailable = true;
    const last = getLastRfidTag();
    if (last) this.tagId = last;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    bleService.removeEventListener('status-changed', this._onStatus);
    this._stopNfc();
  }

  /* ── Flow ── */
  private async _startFlow() {
    if (this.flowRunning) return;
    this.flowRunning = true;
    this.stepTag = this.stepLocation = this.stepSampling = 'idle';
    this.stepError = '';

    await bleService.sendCmd(`setTime -ts ${Math.floor(Date.now() / 1000)}`);

    this.stepTag = 'running';
    const tagLines = await bleService.sendCmd(`setTag -id ${this.tagId}`);
    if (!this._isOk(tagLines)) {
      this.stepTag = 'error'; this.stepError = tagLines[0] ?? 'setTag failed';
      this.flowRunning = false; return;
    }
    this.stepTag = 'ok';

    this.stepLocation = 'running';
    const locLines = await bleService.sendCmd(`setLocation -lat ${this.lat} -lon ${this.lon}`);
    if (!this._isOk(locLines)) {
      this.stepLocation = 'error'; this.stepError = locLines[0] ?? 'setLocation failed';
      this.flowRunning = false; return;
    }
    this.stepLocation = 'ok';

    this.stepSampling = 'running';
    let cmd = 'startSampling';
    if (this.flowrateSP) cmd += ` -flowrate ${this.flowrateSP}`;
    if (this.durationH)  cmd += ` -durationS ${Math.round(parseFloat(this.durationH) * 3600)}`;
    if (this.delayH)     cmd += ` -delayS ${Math.round(parseFloat(this.delayH) * 3600)}`;
    const sampLines = await bleService.sendCmd(cmd);
    if (!this._isOk(sampLines)) {
      this.stepSampling = 'error'; this.stepError = sampLines[0] ?? 'startSampling failed';
      this.flowRunning = false; return;
    }
    this.stepSampling = 'ok';
    this.flowRunning = false;
    window.location.href = resolveRouterPath('status');
  }

  private async _stop() {
    await bleService.sendCmd('stopSampling');
    this.stepSampling = this.stepTag = this.stepLocation = 'idle';
  }

  private _isOk(lines: string[]) { return lines.some(l => l.startsWith('OK')); }

  /* ── NFC ── */
  private async _scanNfc() {
    if (!this.nfcAvailable || this.nfcScanning) return;
    this.nfcScanning = true;
    this.nfcError = '';
    this.nfcAbort = new AbortController();
    try {
      const reader = new (window as any).NDEFReader();
      reader.addEventListener('reading', ({ message, serialNumber }: any) => {
        let id = '';
        for (const record of message.records) {
          if (record.recordType === 'text') {
            id = new TextDecoder(record.encoding ?? 'utf-8').decode(record.data);
            break;
          }
        }
        if (!id && serialNumber) id = serialNumber;
        if (id) this.tagId = id;
        this._stopNfc();
      });
      reader.addEventListener('readingerror', () => {
        this.nfcError = 'Could not read tag — try again';
        this._stopNfc();
      });
      await reader.scan({ signal: this.nfcAbort.signal });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        this.nfcError = err.name === 'NotAllowedError'
          ? 'NFC permission denied'
          : `NFC error: ${err.message}`;
      }
      this.nfcScanning = false;
      this.nfcAbort = null;
    }
  }

  private _stopNfc() {
    if (this.nfcAbort) { this.nfcAbort.abort(); this.nfcAbort = null; }
    this.nfcScanning = false;
  }

  /* ── GPS ── */
  private _getGps() {
    if (!('geolocation' in navigator) || this.gpsLoading) return;
    this.gpsLoading = true;
    navigator.geolocation.getCurrentPosition(
      pos => {
        this.lat = pos.coords.latitude.toFixed(6);
        this.lon = pos.coords.longitude.toFixed(6);
        this.gpsLoading = false;
      },
      () => { this.gpsLoading = false; },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  private _stepDot(s: StepStatus) {
    const cls = s === 'ok' ? 'ok' : s === 'error' ? 'err' : s === 'running' ? 'spin' : 'idle';
    return html`<span class="step-dot ${cls}"></span>`;
  }

  /* ── Styles ── */
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
      max-width: 520px;
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
      max-width: 520px;
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

    /* ── Card ── */
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px 18px;
    }

    .card-title {
      font-size: 0.75rem;
      font-weight: 500;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--muted-fg);
      margin-bottom: 16px;
    }

    /* ── Sections inside card ── */
    .section {
      padding-top: 16px;
      border-top: 1px solid var(--border);
      margin-top: 16px;
    }

    .section:first-of-type { border-top: none; padding-top: 0; margin-top: 0; }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .section-label {
      font-size: 0.6875rem;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted-fg);
    }

    .section-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* ── Step status dot ── */
    .step-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .step-dot.idle { background: #3f3f46; }
    .step-dot.ok   { background: #22c55e; box-shadow: 0 0 4px #22c55e88; }
    .step-dot.err  { background: #ef4444; }
    .step-dot.spin { background: #a1a1aa; animation: blink 0.7s infinite; }

    @keyframes blink { 50% { opacity: 0.2; } }

    /* ── Fields ── */
    .field-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .field-row + .field-row { margin-top: 6px; }

    .input {
      flex: 1;
      min-width: 60px;
      font-family: var(--mono);
      font-size: 0.8125rem;
      padding: 8px 10px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: #18181b;
      color: var(--fg);
      outline: none;
      transition: border-color 0.15s;
    }

    .input::placeholder { color: #3f3f46; }
    .input:focus { border-color: #52525b; }
    .input:disabled { opacity: 0.35; }

    .unit {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--muted-fg);
      flex-shrink: 0;
    }

    /* ── Param groups ── */
    .param-label {
      font-size: 0.72rem;
      font-weight: 500;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted-fg);
      margin-bottom: 6px;
    }

    .param-group + .param-group { margin-top: 14px; }

    /* ── Presets ── */
    .preset-row {
      display: flex;
      gap: 5px;
      flex-wrap: wrap;
      margin-bottom: 6px;
    }

    .preset {
      font-family: var(--mono);
      font-size: 0.68rem;
      padding: 4px 11px;
      border: 1px solid var(--border);
      border-radius: 5px;
      background: transparent;
      color: var(--muted-fg);
      cursor: pointer;
      transition: all 0.12s;
    }

    .preset:hover:not(:disabled) { border-color: #52525b; color: var(--fg); }
    .preset.active { border-color: var(--fg); color: var(--fg); background: #27272a; }
    .preset:disabled { opacity: 0.3; cursor: not-allowed; }

    /* ── Ghost btn ── */
    .btn-ghost {
      font-family: var(--mono);
      font-size: 0.72rem;
      padding: 5px 12px;
      border: 1px solid var(--border);
      border-radius: 5px;
      background: transparent;
      color: var(--muted-fg);
      cursor: pointer;
      transition: all 0.12s;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .btn-ghost:hover:not(:disabled) { border-color: #52525b; color: var(--fg); }
    .btn-ghost:disabled { opacity: 0.3; cursor: not-allowed; }

    .btn-ghost.scanning { color: #f59e0b; border-color: #f59e0b40; }

    /* ── NFC indicator ── */
    .nfc-status {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: var(--mono);
      font-size: 0.68rem;
      color: #a1a1aa;
      margin-top: 6px;
    }

    .nfc-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #f59e0b;
      animation: blink 0.5s infinite;
    }

    .err-text {
      font-family: var(--mono);
      font-size: 0.68rem;
      color: #f87171;
      margin-top: 6px;
    }

    /* ── Tooltip ── */
    .tooltip-wrap { position: relative; display: inline-block; }
    .tooltip-wrap:hover .tooltip { opacity: 1; }
    .tooltip {
      position: absolute;
      bottom: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      background: #18181b;
      border: 1px solid var(--border);
      border-radius: 5px;
      padding: 4px 8px;
      font-family: var(--mono);
      font-size: 0.6rem;
      color: var(--muted-fg);
      white-space: nowrap;
      opacity: 0;
      transition: opacity 0.12s;
      pointer-events: none;
      z-index: 10;
    }

    /* ── Error banner ── */
    .error-banner {
      border: 1px solid #7f1d1d;
      border-radius: 6px;
      padding: 9px 12px;
      background: rgba(239,68,68,0.06);
      font-family: var(--mono);
      font-size: 0.72rem;
      color: #fca5a5;
      word-break: break-all;
      margin-top: 12px;
    }

    /* ── Action buttons ── */
    .btn-start {
      width: 100%;
      padding: 13px;
      font-family: var(--sans);
      font-size: 0.875rem;
      font-weight: 500;
      letter-spacing: -0.01em;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      background: var(--fg);
      color: #09090b;
      transition: opacity 0.15s;
    }

    .btn-start:hover:not(:disabled) { opacity: 0.88; }
    .btn-start:disabled { opacity: 0.3; cursor: not-allowed; }

    .btn-stop {
      width: 100%;
      padding: 12px;
      font-family: var(--sans);
      font-size: 0.875rem;
      font-weight: 500;
      border: 1px solid #7f1d1d;
      border-radius: 6px;
      cursor: pointer;
      background: rgba(239,68,68,0.06);
      color: #fca5a5;
      transition: background 0.15s;
    }

    .btn-stop:hover { background: rgba(239,68,68,0.12); }
  `;

  render() {
    const isRunning = this.stepSampling === 'ok';
    const canStart  = this.connected && !!this.tagId.trim() && !!this.lat.trim() && !!this.lon.trim() && !this.flowRunning;

    return html`
      <main>
        <div class="page-header">
          <a class="back-btn" href="${resolveRouterPath()}">←</a>
          <span class="page-title">Start Sampling</span>
        </div>

        <div class="content">

          ${!this.connected ? html`
            <div class="alert">
              <span>Device not connected</span>
              <a href="${resolveRouterPath('connect')}">Connect →</a>
            </div>
          ` : ''}

          <!-- Mission Setup -->
          <div class="card">
            <div class="card-title">Mission Setup</div>

            <!-- Tag ID -->
            <div class="section">
              <div class="section-header">
                <span class="section-label">Tag ID</span>
                <div class="section-right">
                  ${this._stepDot(this.stepTag)}
                  <span class="${!this.nfcAvailable ? 'tooltip-wrap' : ''}">
                    <button class="btn-ghost ${this.nfcScanning ? 'scanning' : ''}"
                      ?disabled=${!this.connected}
                      @click=${this.nfcScanning ? this._stopNfc : this._scanNfc}>
                      ${this.nfcScanning ? 'Cancel' : 'Scan NFC'}
                    </button>
                    ${!this.nfcAvailable ? html`<span class="tooltip">Requires Chrome on Android</span>` : ''}
                  </span>
                </div>
              </div>
              <input class="input" type="text" placeholder="e.g. sample1"
                .value=${this.tagId}
                @input=${(e: Event) => { this.tagId = (e.target as HTMLInputElement).value; }}
                ?disabled=${!this.connected} />
              ${this.nfcScanning ? html`
                <div class="nfc-status"><span class="nfc-dot"></span>Hold tag near phone…</div>
              ` : ''}
              ${this.nfcError ? html`<div class="err-text">${this.nfcError}</div>` : ''}
            </div>

            <!-- Location -->
            <div class="section">
              <div class="section-header">
                <span class="section-label">Location</span>
                <div class="section-right">
                  ${this._stepDot(this.stepLocation)}
                  <button class="btn-ghost"
                    ?disabled=${!this.connected || this.gpsLoading}
                    @click=${this._getGps}>
                    ${this.gpsLoading ? 'Getting…' : 'GPS'}
                  </button>
                </div>
              </div>
              <div class="field-row">
                <input class="input" type="number" placeholder="Latitude" step="0.000001"
                  .value=${this.lat}
                  @input=${(e: Event) => { this.lat = (e.target as HTMLInputElement).value; }}
                  ?disabled=${!this.connected} />
                <input class="input" type="number" placeholder="Longitude" step="0.000001"
                  .value=${this.lon}
                  @input=${(e: Event) => { this.lon = (e.target as HTMLInputElement).value; }}
                  ?disabled=${!this.connected} />
              </div>
            </div>

            <!-- Sampling params -->
            <div class="section">
              <div class="section-header">
                <span class="section-label">Sampling</span>
                <div class="section-right">
                  ${this._stepDot(this.stepSampling)}
                </div>
              </div>

              <div class="param-group">
                <div class="param-label">Delay</div>
                <div class="preset-row">
                  ${['0','1','6','12','24'].map(h => html`
                    <button class="preset ${this.delayH === h ? 'active' : ''}"
                      ?disabled=${!this.connected}
                      @click=${() => { this.delayH = h; }}>
                      ${h === '0' ? 'None' : h + 'h'}
                    </button>
                  `)}
                </div>
                <div class="field-row">
                  <input class="input" type="number" placeholder="0" step="0.5" min="0"
                    .value=${this.delayH}
                    @input=${(e: Event) => { this.delayH = (e.target as HTMLInputElement).value; }}
                    ?disabled=${!this.connected} />
                  <span class="unit">h</span>
                </div>
              </div>

              <div class="param-group">
                <div class="param-label">Duration</div>
                <div class="preset-row">
                  ${['1','6','12','24'].map(h => html`
                    <button class="preset ${this.durationH === h ? 'active' : ''}"
                      ?disabled=${!this.connected}
                      @click=${() => { this.durationH = h; }}>
                      ${h}h
                    </button>
                  `)}
                </div>
                <div class="field-row">
                  <input class="input" type="number" placeholder="1" step="0.5" min="0"
                    .value=${this.durationH}
                    @input=${(e: Event) => { this.durationH = (e.target as HTMLInputElement).value; }}
                    ?disabled=${!this.connected} />
                  <span class="unit">h</span>
                </div>
              </div>

              <div class="param-group">
                <div class="param-label">Flowrate</div>
                <div class="preset-row">
                  ${['1.0','2.0','4.0'].map(v => html`
                    <button class="preset ${this.flowrateSP === v ? 'active' : ''}"
                      ?disabled=${!this.connected}
                      @click=${() => { this.flowrateSP = v; }}>
                      ${v} L/s
                    </button>
                  `)}
                </div>
                <div class="field-row">
                  <input class="input" type="number" placeholder="1.0" step="0.1" min="0"
                    .value=${this.flowrateSP}
                    @input=${(e: Event) => { this.flowrateSP = (e.target as HTMLInputElement).value; }}
                    ?disabled=${!this.connected} />
                  <span class="unit">L/s</span>
                </div>
              </div>

              ${this.stepError ? html`<div class="error-banner">${this.stepError}</div>` : ''}
            </div>
          </div>

          <!-- Action -->
          ${isRunning
            ? html`<button class="btn-stop" @click=${this._stop}>Stop Sampling</button>`
            : html`<button class="btn-start" ?disabled=${!canStart} @click=${this._startFlow}>
                ${this.flowRunning ? 'Starting…' : 'Start Sampling'}
              </button>`
          }

        </div>
      </main>
    `;
  }
}
