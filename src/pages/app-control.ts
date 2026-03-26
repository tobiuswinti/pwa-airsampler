import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import { getLastRfidTag } from '../log-store';
import { bleService } from '../ble-service';

type StepStatus = 'idle' | 'running' | 'ok' | 'error';

@customElement('app-control')
export class AppControl extends LitElement {

  /* ── Reactive mirrors of service state ── */
  @state() private connected = bleService.connStatus === 'connected';

  /* ── Setup fields ── */
  @state() private tagId = '';
  @state() private lat = '';
  @state() private lon = '';
  @state() private flowrateSP = '1.0';
  @state() private durationH = '1';
  @state() private delayH = '';

  /* ── NFC ── */
  @state() private nfcScanning = false;
  @state() private nfcAvailable = false;
  @state() private nfcError = '';

  /* ── GPS ── */
  @state() private gpsLoading = false;

  /* ── Flow ── */
  @state() private stepTag:      StepStatus = 'idle';
  @state() private stepLocation: StepStatus = 'idle';
  @state() private stepSampling: StepStatus = 'idle';
  @state() private stepError = '';
  @state() private flowRunning = false;

  /* ── Internals ── */
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

    // Always sync time before sampling
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
    this.stepSampling = 'idle';
    this.stepTag = this.stepLocation = 'idle';
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

  private _stepIcon(s: StepStatus) {
    if (s === 'ok')      return html`<span class="step-icon ok">✓</span>`;
    if (s === 'error')   return html`<span class="step-icon error">✗</span>`;
    if (s === 'running') return html`<span class="step-icon running">…</span>`;
    return html`<span class="step-icon idle">·</span>`;
  }

  /* ── Styles ── */
  static styles = css`
    :host {
      --bg:      #08090d;
      --surface: #0e1118;
      --border:  #1e2535;
      --accent:  #00e5ff;
      --accent2: #7c3aed;
      --ok:      #00ffa3;
      --warn:    #ff6b35;
      --text:    #c8d6ef;
      --muted:   #4a5568;
      --mono:    'Share Tech Mono', monospace;
      --display: 'Oxanium', sans-serif;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    main {
      font-family: var(--display);
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0 0 60px;
      position: relative;
    }

    main::before {
      content: '';
      position: fixed;
      inset: 0;
      background-image:
        linear-gradient(rgba(0,229,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,229,255,0.03) 1px, transparent 1px);
      background-size: 40px 40px;
      pointer-events: none;
      z-index: 0;
    }

    .page-header {
      width: 100%;
      padding: 20px 24px 0;
      display: flex;
      align-items: center;
      gap: 12px;
      z-index: 1;
    }

    .logo-icon {
      width: 34px; height: 34px;
      border: 2px solid var(--ok);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 12px rgba(0,255,163,0.3);
      flex-shrink: 0;
    }

    .logo-icon svg { width: 18px; height: 18px; fill: var(--ok); }

    .page-title {
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--ok);
    }

    .content {
      width: 100%;
      max-width: 640px;
      padding: 28px 20px;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* Disconnected overlay */
    .disconnected-notice {
      background: rgba(255,107,53,0.06);
      border: 1px solid rgba(255,107,53,0.3);
      border-radius: 12px;
      padding: 14px 18px;
      font-size: 0.82rem;
      line-height: 1.65;
      color: #e2a98a;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .disconnected-notice a {
      color: var(--accent);
      text-decoration: none;
      font-family: var(--mono);
      font-size: 0.75rem;
      border: 1px solid var(--accent);
      padding: 4px 10px;
      border-radius: 5px;
      white-space: nowrap;
    }

    /* ── Cards ── */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px;
      position: relative;
      overflow: hidden;
    }

    .card::after {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--ok), transparent);
    }

    .card-title {
      font-family: var(--mono);
      font-size: 0.72rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ok);
      margin-bottom: 16px;
    }

    .setup-section {
      border-top: 1px solid var(--border);
      padding-top: 14px;
      margin-top: 14px;
    }

    .setup-section:first-of-type { border-top: none; padding-top: 0; margin-top: 0; }

    .section-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }

    .section-label {
      font-family: var(--mono);
      font-size: 0.68rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .step-icon {
      font-family: var(--mono);
      font-size: 0.85rem;
      width: 20px; height: 20px;
      display: inline-flex; align-items: center; justify-content: center;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .step-icon.idle    { color: var(--muted); }
    .step-icon.ok      { color: var(--ok); }
    .step-icon.error   { color: var(--warn); }
    .step-icon.running { color: var(--accent); animation: blink 0.8s infinite; }

    @keyframes blink { 50% { opacity: 0.3; } }

    .time-display {
      font-family: var(--mono);
      font-size: 1.05rem;
      color: var(--accent);
      letter-spacing: 0.05em;
    }

    .field-row {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }

    .field-row + .field-row { margin-top: 8px; }

    .text-input {
      flex: 1;
      min-width: 80px;
      font-family: var(--mono);
      font-size: 0.82rem;
      padding: 9px 12px;
      border-radius: 7px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.03);
      color: var(--text);
      outline: none;
      transition: border-color 0.2s;
    }

    .text-input::placeholder { color: var(--muted); }
    .text-input:focus { border-color: var(--accent2); }
    .text-input:disabled { opacity: 0.4; }

    .field-unit {
      font-family: var(--mono);
      font-size: 0.7rem;
      color: var(--muted);
      flex-shrink: 0;
    }

    .param-label {
      font-family: var(--mono);
      font-size: 0.62rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 6px;
    }

    .preset-row {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 6px;
    }

    .preset-btn {
      font-family: var(--mono);
      font-size: 0.68rem;
      letter-spacing: 0.05em;
      padding: 5px 12px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.02);
      color: var(--muted);
      cursor: pointer;
      transition: all 0.15s;
    }

    .preset-btn:hover:not(:disabled) {
      border-color: var(--accent2);
      color: var(--accent2);
      background: rgba(124,58,237,0.08);
    }

    .preset-btn.active {
      border-color: var(--accent2);
      color: var(--accent2);
      background: rgba(124,58,237,0.12);
    }

    .preset-btn:disabled { opacity: 0.3; cursor: not-allowed; }

    .tooltip-wrap {
      position: relative;
      display: inline-block;
    }

    .tooltip-wrap:hover .tooltip { opacity: 1; pointer-events: none; }

    .tooltip {
      position: absolute;
      bottom: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      background: #1a1f2e;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 5px 10px;
      font-family: var(--mono);
      font-size: 0.62rem;
      color: var(--muted);
      white-space: nowrap;
      opacity: 0;
      transition: opacity 0.15s;
      z-index: 10;
    }

    .tooltip::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border: 5px solid transparent;
      border-top-color: var(--border);
    }

    .btn {
      font-family: var(--display);
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 10px 22px;
      border-radius: 7px;
      border: none;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.15s;
    }

    .btn:hover  { opacity: 0.85; transform: translateY(-1px); }
    .btn:active { transform: translateY(0); }
    .btn:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }

    .btn-ghost  { background: transparent; border: 1px solid var(--border); color: var(--text); }
    .btn-ghost:hover { border-color: var(--accent); color: var(--accent); }
    .btn-danger { background: transparent; border: 1px solid var(--warn); color: var(--warn); }
    .btn-danger:hover { background: rgba(255,107,53,0.08); }
    .btn-sm     { padding: 7px 14px; font-size: 0.72rem; }

    .btn-start {
      width: 100%;
      padding: 16px;
      font-size: 0.9rem;
      letter-spacing: 0.2em;
      background: linear-gradient(135deg, var(--accent2), var(--ok));
      color: #fff;
      border-radius: 10px;
      box-shadow: 0 0 24px rgba(0,255,163,0.12);
    }

    .btn-stop {
      width: 100%;
      padding: 14px;
      font-size: 0.85rem;
      letter-spacing: 0.15em;
      background: transparent;
      border: 1px solid var(--warn);
      color: var(--warn);
      border-radius: 10px;
    }

    .btn-stop:hover { background: rgba(255,107,53,0.08); }

    .nfc-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: var(--mono);
      font-size: 0.68rem;
      color: var(--accent2);
      letter-spacing: 0.05em;
    }

    .nfc-pulse {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--accent2);
      animation: blink 0.6s infinite;
    }

    .error-banner {
      background: rgba(255,107,53,0.08);
      border: 1px solid rgba(255,107,53,0.35);
      border-radius: 8px;
      padding: 10px 14px;
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--warn);
      word-break: break-all;
      margin-top: 12px;
    }

    .nav-back {
      font-family: var(--mono);
      font-size: 0.72rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      background: none;
      border: 1px solid var(--border);
      color: var(--muted);
      padding: 9px 18px;
      border-radius: 6px;
      cursor: pointer;
      transition: color 0.2s, border-color 0.2s;
      text-decoration: none;
      display: inline-block;
    }

    .nav-back:hover { color: var(--accent); border-color: var(--accent); }

    @media (max-width: 480px) {
      .card { padding: 16px; }
    }
  `;

  /* ── Render ── */
  render() {
    const isRunning = this.stepSampling === 'ok';
    const canStart  = this.connected && !!this.tagId.trim() && !!this.lat.trim() && !!this.lon.trim() && !this.flowRunning;

    return html`
      <main>
        <div class="page-header">
          <div class="logo-icon">
            <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm-1 14V8l6 4-6 4z"/></svg>
          </div>
          <span class="page-title">Start Sampling</span>
        </div>

        <div class="content">

          ${!this.connected ? html`
            <div class="disconnected-notice">
              <span>Device not connected.</span>
              <a href="${resolveRouterPath('connect')}">Go to Connect →</a>
            </div>
          ` : ''}

          <!-- Mission Setup -->
          <div class="card">
            <div class="card-title">Mission Setup</div>

            <!-- Tag ID -->
            <div class="setup-section">
              <div class="section-header">
                ${this._stepIcon(this.stepTag)}
                <span class="section-label">Tag ID</span>
                <span class="${!this.nfcAvailable ? 'tooltip-wrap' : ''}">
                  <button class="btn btn-ghost btn-sm"
                    ?disabled=${!this.connected || !this.nfcAvailable}
                    @click=${this.nfcScanning ? this._stopNfc : this._scanNfc}>
                    ${this.nfcScanning ? 'Cancel' : 'Scan NFC'}
                  </button>
                  ${!this.nfcAvailable ? html`<span class="tooltip">Requires Chrome on Android</span>` : ''}
                </span>
              </div>
              <div class="field-row">
                <input class="text-input" type="text" placeholder="e.g. sample1"
                  .value=${this.tagId}
                  @input=${(e: Event) => { this.tagId = (e.target as HTMLInputElement).value; }}
                  ?disabled=${!this.connected} />
              </div>
              ${this.nfcScanning ? html`
                <div class="nfc-badge" style="margin-top:8px;">
                  <span class="nfc-pulse"></span>
                  Hold tag near phone…
                </div>
              ` : ''}
              ${this.nfcError ? html`
                <div style="font-family:var(--mono);font-size:0.68rem;color:var(--warn);margin-top:6px;">${this.nfcError}</div>
              ` : ''}
            </div>

            <!-- Location -->
            <div class="setup-section">
              <div class="section-header">
                ${this._stepIcon(this.stepLocation)}
                <span class="section-label">Location</span>
                <button class="btn btn-ghost btn-sm"
                  ?disabled=${!this.connected || this.gpsLoading}
                  @click=${this._getGps}>
                  ${this.gpsLoading ? 'Getting…' : 'GPS'}
                </button>
              </div>
              <div class="field-row">
                <input class="text-input" type="number" placeholder="Latitude" step="0.000001"
                  .value=${this.lat}
                  @input=${(e: Event) => { this.lat = (e.target as HTMLInputElement).value; }}
                  ?disabled=${!this.connected} />
                <input class="text-input" type="number" placeholder="Longitude" step="0.000001"
                  .value=${this.lon}
                  @input=${(e: Event) => { this.lon = (e.target as HTMLInputElement).value; }}
                  ?disabled=${!this.connected} />
              </div>
            </div>

            <!-- Sampling params -->
            <div class="setup-section">
              <div class="section-header">
                ${this._stepIcon(this.stepSampling)}
                <span class="section-label">Sampling</span>
              </div>

              <div class="param-label">Delay</div>
              <div class="preset-row">
                ${['0', '1', '6', '12', '24'].map(h => html`
                  <button class="preset-btn ${this.delayH === h ? 'active' : ''}"
                    ?disabled=${!this.connected}
                    @click=${() => { this.delayH = h; }}>
                    ${h === '0' ? 'None' : h + 'h'}
                  </button>
                `)}
              </div>
              <div class="field-row">
                <input class="text-input" type="number" placeholder="0" step="0.5" min="0"
                  .value=${this.delayH}
                  @input=${(e: Event) => { this.delayH = (e.target as HTMLInputElement).value; }}
                  ?disabled=${!this.connected} />
                <span class="field-unit">h</span>
              </div>

              <div class="param-label" style="margin-top:12px;">Duration</div>
              <div class="preset-row">
                ${['1', '6', '12', '24'].map(h => html`
                  <button class="preset-btn ${this.durationH === h ? 'active' : ''}"
                    ?disabled=${!this.connected}
                    @click=${() => { this.durationH = h; }}>
                    ${h}h
                  </button>
                `)}
              </div>
              <div class="field-row">
                <input class="text-input" type="number" placeholder="1" step="0.5" min="0"
                  .value=${this.durationH}
                  @input=${(e: Event) => { this.durationH = (e.target as HTMLInputElement).value; }}
                  ?disabled=${!this.connected} />
                <span class="field-unit">h</span>
              </div>

              <div class="param-label" style="margin-top:12px;">Flowrate</div>
              <div class="preset-row">
                ${['1.0', '2.0', '4.0'].map(v => html`
                  <button class="preset-btn ${this.flowrateSP === v ? 'active' : ''}"
                    ?disabled=${!this.connected}
                    @click=${() => { this.flowrateSP = v; }}>
                    ${v} L/s
                  </button>
                `)}
              </div>
              <div class="field-row">
                <input class="text-input" type="number" placeholder="1.0" step="0.1" min="0"
                  .value=${this.flowrateSP}
                  @input=${(e: Event) => { this.flowrateSP = (e.target as HTMLInputElement).value; }}
                  ?disabled=${!this.connected} />
                <span class="field-unit">L/s</span>
              </div>
            </div>

            ${this.stepError ? html`<div class="error-banner">${this.stepError}</div>` : ''}
          </div>

          <!-- Start / Stop -->
          ${isRunning
            ? html`<button class="btn btn-stop" @click=${this._stop}>Stop Sampling</button>`
            : html`<button class="btn btn-start" ?disabled=${!canStart} @click=${this._startFlow}>
                ${this.flowRunning ? 'Starting…' : 'Start'}
              </button>`
          }

          <div><a class="nav-back" href="${resolveRouterPath()}">← Back to Home</a></div>

        </div>
      </main>
    `;
  }

}
