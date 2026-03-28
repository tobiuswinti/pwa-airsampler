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
  @state() private flowrateSP   = '1.0';
  @state() private durationH    = '1';
  @state() private delayH       = '0';
  @state() private maxHumidity  = '100';
  @state() private minSoC       = '2';

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
    if (this.flowrateSP)  cmd += ` -flowrate ${this.flowrateSP}`;
    if (this.durationH)   cmd += ` -durationS ${Math.round(parseFloat(this.durationH) * 3600)}`;
    if (this.delayH && this.delayH !== '0') cmd += ` -delayS ${Math.round(parseFloat(this.delayH) * 3600)}`;
    if (this.maxHumidity) cmd += ` -maxHumidity ${this.maxHumidity}`;
    if (this.minSoC)      cmd += ` -minSoC ${this.minSoC}`;
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

  /* ── Step state helpers ── */
  private _stepIcon(s: StepStatus) {
    if (s === 'ok')    return html`<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#22c55e" stroke-width="1.5"/><path d="M5 8l2 2 4-4" stroke="#22c55e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    if (s === 'error') return html`<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#ef4444" stroke-width="1.5"/><path d="M6 6l4 4M10 6l-4 4" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    if (s === 'running') return html`<span class="spin-dot"></span>`;
    return null;
  }

  /* ── Styles ── */
  static styles = css`
    :host {
      --bg:       #09090b;
      --card:     #111113;
      --border:   #3f3f46;
      --fg:       #fafafa;
      --muted-fg: #a1a1aa;
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
      border-radius: 8px;
      background: transparent;
      color: var(--muted-fg);
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
      text-decoration: none;
      font-size: 1rem;
    }

    .back-btn:hover { color: var(--fg); border-color: #52525b; }

    .page-title {
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--fg);
      letter-spacing: -0.01em;
    }

    .content {
      width: 100%;
      max-width: 520px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    /* ── Step card ── */
    .step-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      transition: border-color 0.2s;
    }

    .step-card.status-ok      { border-color: rgba(34,197,94,0.35); }
    .step-card.status-error   { border-color: rgba(239,68,68,0.35); }
    .step-card.status-running { border-color: rgba(245,158,11,0.35); }

    .step-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 16px 12px;
    }

    .step-num {
      font-size: 0.625rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #52525b;
      background: #1c1c1f;
      border: 1px solid #2e2e33;
      border-radius: 5px;
      padding: 2px 6px;
      flex-shrink: 0;
    }

    .step-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--fg);
      letter-spacing: -0.01em;
      flex: 1;
    }

    .step-status {
      display: flex;
      align-items: center;
      flex-shrink: 0;
    }

    .spin-dot {
      display: inline-block;
      width: 8px; height: 8px;
      border-radius: 50%;
      background: #f59e0b;
      animation: pulse 0.7s infinite;
    }

    @keyframes pulse { 50% { opacity: 0.2; } }

    .step-body {
      padding: 0 16px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    /* ── Input ── */
    .input {
      width: 100%;
      font-family: var(--mono);
      font-size: 0.875rem;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #0d0d0f;
      color: var(--fg);
      outline: none;
      transition: border-color 0.15s;
    }

    .input::placeholder { color: #3f3f46; }
    .input:focus { border-color: #52525b; }
    .input:disabled { opacity: 0.3; }

    .input-row {
      display: flex;
      gap: 8px;
    }

    .input-row .input { flex: 1; min-width: 0; }

    /* ── NFC button ── */
    .nfc-btn {
      font-family: var(--sans);
      font-size: 0.8125rem;
      font-weight: 500;
      padding: 10px 14px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: transparent;
      color: var(--muted-fg);
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: border-color 0.15s, color 0.15s;
    }

    .nfc-btn:hover:not(:disabled) { border-color: #52525b; color: var(--fg); }
    .nfc-btn:disabled { opacity: 0.3; cursor: not-allowed; }
    .nfc-btn.scanning { color: #f59e0b; border-color: rgba(245,158,11,0.4); background: rgba(245,158,11,0.05); }

    .nfc-hint {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.75rem;
      color: #f59e0b;
    }

    .nfc-hint-dot {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: #f59e0b;
      animation: pulse 0.5s infinite;
    }

    .err-text {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: #f87171;
    }

    /* ── GPS button ── */
    .gps-btn {
      font-family: var(--sans);
      font-size: 0.8125rem;
      font-weight: 500;
      padding: 10px 14px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: transparent;
      color: var(--muted-fg);
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
      transition: border-color 0.15s, color 0.15s;
    }

    .gps-btn:hover:not(:disabled) { border-color: #52525b; color: var(--fg); }
    .gps-btn:disabled { opacity: 0.3; cursor: not-allowed; }

    /* ── Param grid ── */
    .param-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .param-grid.cols-3 {
      grid-template-columns: 1fr 1fr 1fr;
    }

    .param-item {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .param-label {
      font-size: 0.6875rem;
      font-weight: 500;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--muted-fg);
    }

    /* ── Presets ── */
    .presets {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    .preset {
      font-family: var(--mono);
      font-size: 0.6875rem;
      padding: 3px 9px;
      border: 1px solid #2e2e33;
      border-radius: 20px;
      background: transparent;
      color: #71717a;
      cursor: pointer;
      transition: all 0.12s;
      white-space: nowrap;
    }

    .preset:hover:not(:disabled) { border-color: #52525b; color: var(--muted-fg); }
    .preset.active { border-color: #52525b; color: var(--fg); background: #1c1c1f; }
    .preset:disabled { opacity: 0.25; cursor: not-allowed; }

    /* ── Param input with unit ── */
    .param-input-wrap {
      position: relative;
    }

    .param-input-wrap .input {
      padding-right: 32px;
    }

    .param-unit {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      font-family: var(--mono);
      font-size: 0.72rem;
      color: #52525b;
      pointer-events: none;
    }

    /* ── Divider ── */
    .divider {
      height: 1px;
      background: var(--border);
      margin: 2px 0;
    }

    /* ── Error banner ── */
    .error-banner {
      border: 1px solid rgba(239,68,68,0.3);
      border-radius: 8px;
      padding: 10px 14px;
      background: rgba(239,68,68,0.06);
      font-family: var(--mono);
      font-size: 0.72rem;
      color: #fca5a5;
      word-break: break-all;
    }

    /* ── Connect banner ── */
    .connect-banner {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      border: 1px solid rgba(59,130,246,0.3);
      border-radius: 12px;
      background: rgba(59,130,246,0.06);
      color: #93c5fd;
      font-family: var(--sans);
      text-decoration: none;
      transition: border-color 0.15s, background 0.15s;
    }

    .connect-banner:hover {
      border-color: rgba(59,130,246,0.5);
      background: rgba(59,130,246,0.1);
    }

    .connect-banner .cb-icon {
      width: 40px; height: 40px;
      border-radius: 10px;
      background: rgba(59,130,246,0.1);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }

    .connect-banner .cb-label {
      flex: 1;
      font-size: 0.9375rem;
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .connect-banner .cb-arrow {
      color: rgba(147,197,253,0.5);
      font-size: 1.1rem;
    }

    /* ── Start button ── */
    .btn-start {
      width: 100%;
      padding: 15px;
      font-family: var(--sans);
      font-size: 0.9375rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      background: var(--fg);
      color: #09090b;
      transition: opacity 0.15s, transform 0.1s;
      margin-top: 4px;
    }

    .btn-start:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
    .btn-start:active:not(:disabled) { transform: translateY(0); }
    .btn-start:disabled { opacity: 0.25; cursor: not-allowed; transform: none; }

    .btn-stop {
      width: 100%;
      padding: 14px;
      font-family: var(--sans);
      font-size: 0.9375rem;
      font-weight: 600;
      border: 1px solid rgba(239,68,68,0.3);
      border-radius: 12px;
      cursor: pointer;
      background: rgba(239,68,68,0.06);
      color: #fca5a5;
      transition: background 0.15s;
      margin-top: 4px;
    }

    .btn-stop:hover { background: rgba(239,68,68,0.12); }

    /* ── NFC tooltip ── */
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
      font-size: 0.65rem;
      color: var(--muted-fg);
      white-space: nowrap;
      opacity: 0;
      transition: opacity 0.12s;
      pointer-events: none;
      z-index: 10;
    }
  `;

  render() {
    const isRunning = this.stepSampling === 'ok';
    const canStart  = this.connected && !!this.tagId.trim() && !!this.lat.trim() && !!this.lon.trim() && !this.flowRunning;

    const cardClass = (s: StepStatus) =>
      `step-card ${ s === 'ok' ? 'status-ok' : s === 'error' ? 'status-error' : s === 'running' ? 'status-running' : '' }`;

    return html`
      <main>
        <div class="page-header">
          <a class="back-btn" href="${resolveRouterPath()}">←</a>
          <span class="page-title">Start Sampling</span>
        </div>

        <div class="content">

          ${!this.connected ? html`
            <a class="connect-banner" href="${resolveRouterPath('connect')}">
              <div class="cb-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#93c5fd">
                  <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3a4.237 4.237 0 00-6 0zm-4-4l2 2a7.074 7.074 0 0110 0l2-2C15.14 9.14 8.87 9.14 5 13z"/>
                </svg>
              </div>
              <span class="cb-label">Connect to device to start sampling</span>
              <span class="cb-arrow">›</span>
            </a>
          ` : ''}

          <!-- ① Tag ID -->
          <div class="${cardClass(this.stepTag)}">
            <div class="step-header">
              <span class="step-num">01</span>
              <span class="step-title">Sample Tag</span>
              <span class="step-status">${this._stepIcon(this.stepTag)}</span>
            </div>
            <div class="step-body">
              <div class="input-row">
                <input class="input" type="text" placeholder="e.g. sample-A1"
                  .value=${this.tagId}
                  @input=${(e: Event) => { this.tagId = (e.target as HTMLInputElement).value; }}
                  ?disabled=${!this.connected} />
                <span class="${!this.nfcAvailable ? 'tooltip-wrap' : ''}">
                  <button class="nfc-btn ${this.nfcScanning ? 'scanning' : ''}"
                    ?disabled=${!this.connected || !this.nfcAvailable}
                    @click=${this.nfcScanning ? this._stopNfc : this._scanNfc}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                    </svg>
                    ${this.nfcScanning ? 'Cancel' : 'NFC'}
                  </button>
                  ${!this.nfcAvailable ? html`<span class="tooltip">Requires Chrome on Android</span>` : ''}
                </span>
              </div>
              ${this.nfcScanning ? html`
                <div class="nfc-hint"><span class="nfc-hint-dot"></span>Hold tag near phone…</div>
              ` : ''}
              ${this.nfcError ? html`<div class="err-text">${this.nfcError}</div>` : ''}
            </div>
          </div>

          <!-- ② Location -->
          <div class="${cardClass(this.stepLocation)}">
            <div class="step-header">
              <span class="step-num">02</span>
              <span class="step-title">Location</span>
              <span class="step-status">${this._stepIcon(this.stepLocation)}</span>
            </div>
            <div class="step-body">
              <div class="input-row">
                <input class="input" type="number" placeholder="Latitude" step="0.000001"
                  .value=${this.lat}
                  @input=${(e: Event) => { this.lat = (e.target as HTMLInputElement).value; }}
                  ?disabled=${!this.connected} />
                <input class="input" type="number" placeholder="Longitude" step="0.000001"
                  .value=${this.lon}
                  @input=${(e: Event) => { this.lon = (e.target as HTMLInputElement).value; }}
                  ?disabled=${!this.connected} />
                <button class="gps-btn"
                  ?disabled=${!this.connected || this.gpsLoading}
                  @click=${this._getGps}>
                  ${this.gpsLoading ? '…' : 'GPS'}
                </button>
              </div>
            </div>
          </div>

          <!-- ③ Parameters -->
          <div class="${cardClass(this.stepSampling)}">
            <div class="step-header">
              <span class="step-num">03</span>
              <span class="step-title">Parameters</span>
              <span class="step-status">${this._stepIcon(this.stepSampling)}</span>
            </div>
            <div class="step-body">

              <!-- Timing row -->
              <div class="param-grid">
                <div class="param-item">
                  <span class="param-label">Delay</span>
                  <div class="presets">
                    ${['0','1','6','12','24'].map(h => html`
                      <button class="preset ${this.delayH === h ? 'active' : ''}"
                        ?disabled=${!this.connected}
                        @click=${() => { this.delayH = h; }}>
                        ${h === '0' ? 'None' : h + 'h'}
                      </button>
                    `)}
                  </div>
                  <div class="param-input-wrap">
                    <input class="input" type="number" placeholder="0" step="0.5" min="0"
                      .value=${this.delayH}
                      @input=${(e: Event) => { this.delayH = (e.target as HTMLInputElement).value; }}
                      ?disabled=${!this.connected} />
                    <span class="param-unit">h</span>
                  </div>
                </div>

                <div class="param-item">
                  <span class="param-label">Duration</span>
                  <div class="presets">
                    ${['1','6','12','24'].map(h => html`
                      <button class="preset ${this.durationH === h ? 'active' : ''}"
                        ?disabled=${!this.connected}
                        @click=${() => { this.durationH = h; }}>
                        ${h}h
                      </button>
                    `)}
                  </div>
                  <div class="param-input-wrap">
                    <input class="input" type="number" placeholder="1" step="0.5" min="0"
                      .value=${this.durationH}
                      @input=${(e: Event) => { this.durationH = (e.target as HTMLInputElement).value; }}
                      ?disabled=${!this.connected} />
                    <span class="param-unit">h</span>
                  </div>
                </div>
              </div>

              <div class="divider"></div>

              <!-- Airflow + Limits row -->
              <div class="param-grid cols-3">
                <div class="param-item">
                  <span class="param-label">Flowrate</span>
                  <div class="presets">
                    ${['1.0','2.0','4.0'].map(v => html`
                      <button class="preset ${this.flowrateSP === v ? 'active' : ''}"
                        ?disabled=${!this.connected}
                        @click=${() => { this.flowrateSP = v; }}>
                        ${v}
                      </button>
                    `)}
                  </div>
                  <div class="param-input-wrap">
                    <input class="input" type="number" placeholder="1.0" step="0.1" min="0"
                      .value=${this.flowrateSP}
                      @input=${(e: Event) => { this.flowrateSP = (e.target as HTMLInputElement).value; }}
                      ?disabled=${!this.connected} />
                    <span class="param-unit">L/s</span>
                  </div>
                </div>

                <div class="param-item">
                  <span class="param-label">Max Humidity</span>
                  <div class="presets">
                    ${['60','80','100'].map(v => html`
                      <button class="preset ${this.maxHumidity === v ? 'active' : ''}"
                        ?disabled=${!this.connected}
                        @click=${() => { this.maxHumidity = v; }}>
                        ${v}%
                      </button>
                    `)}
                  </div>
                  <div class="param-input-wrap">
                    <input class="input" type="number" placeholder="100" step="1" min="0" max="100"
                      .value=${this.maxHumidity}
                      @input=${(e: Event) => { this.maxHumidity = (e.target as HTMLInputElement).value; }}
                      ?disabled=${!this.connected} />
                    <span class="param-unit">%</span>
                  </div>
                </div>

                <div class="param-item">
                  <span class="param-label">Min SoC</span>
                  <div class="presets">
                    ${['2','5','10'].map(v => html`
                      <button class="preset ${this.minSoC === v ? 'active' : ''}"
                        ?disabled=${!this.connected}
                        @click=${() => { this.minSoC = v; }}>
                        ${v}%
                      </button>
                    `)}
                  </div>
                  <div class="param-input-wrap">
                    <input class="input" type="number" placeholder="2" step="1" min="0" max="100"
                      .value=${this.minSoC}
                      @input=${(e: Event) => { this.minSoC = (e.target as HTMLInputElement).value; }}
                      ?disabled=${!this.connected} />
                    <span class="param-unit">%</span>
                  </div>
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
