import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import { bleService, ConnStatus, LiveState } from '../ble-service';

@customElement('app-status')
export class AppStatus extends LitElement {

  @state() private connStatus: ConnStatus = bleService.connStatus;
  @state() private liveState: LiveState | null = bleService.liveState;
  @state() private sysLog: string[] = [...bleService.sysLog];

  private _onStatus = () => { this.connStatus = bleService.connStatus; };
  private _onState  = () => { this.liveState  = bleService.liveState; };
  private _onLog    = () => { this.sysLog = [...bleService.sysLog]; };

  connectedCallback() {
    super.connectedCallback();
    bleService.addEventListener('status-changed', this._onStatus);
    bleService.addEventListener('state-changed',  this._onState);
    bleService.addEventListener('log-changed',    this._onLog);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    bleService.removeEventListener('status-changed', this._onStatus);
    bleService.removeEventListener('state-changed',  this._onState);
    bleService.removeEventListener('log-changed',    this._onLog);
  }

  private _fmt(v: number | undefined, dec: number, unit: string) {
    if (v == null) return '—';
    return `${v.toFixed(dec)}${unit ? ' ' + unit : ''}`;
  }

  private _samplingColor(s: string) {
    if (s === 'running') return 'var(--ok)';
    if (s === 'paused')  return 'var(--warn)';
    if (s === 'waiting') return 'orange';
    return 'var(--muted)';
  }

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
      border: 2px solid var(--accent);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 12px rgba(0,229,255,0.3);
      flex-shrink: 0;
    }

    .logo-icon svg { width: 18px; height: 18px; fill: var(--accent); }

    .page-title {
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--accent);
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
      background: linear-gradient(90deg, transparent, var(--accent), transparent);
    }

    .card-title {
      font-family: var(--mono);
      font-size: 0.72rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 14px;
    }

    .sampling-badge {
      display: inline-block;
      padding: 4px 14px;
      border-radius: 20px;
      font-family: var(--mono);
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      background: rgba(255,255,255,0.04);
      border: 1px solid currentColor;
      margin-bottom: 14px;
    }

    .state-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }

    .state-cell {
      background: rgba(255,255,255,0.02);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 12px;
    }

    .state-label {
      font-family: var(--mono);
      font-size: 0.58rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .state-value {
      font-family: var(--mono);
      font-size: 0.88rem;
      color: var(--accent);
      font-weight: 700;
    }

    .ts-line {
      font-family: var(--mono);
      font-size: 0.62rem;
      color: var(--muted);
      margin-top: 10px;
    }

    .log-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .sys-log {
      max-height: 300px;
      overflow-y: auto;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 12px;
      background: rgba(255,255,255,0.02);
    }

    .sys-entry {
      font-family: var(--mono);
      font-size: 0.65rem;
      line-height: 1.6;
      color: var(--muted);
    }

    .btn-clear-log {
      font-size: 0.62rem;
      font-family: var(--mono);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      background: none;
      border: 1px solid var(--border);
      color: var(--muted);
      padding: 3px 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: color 0.2s, border-color 0.2s;
    }

    .btn-clear-log:hover { color: var(--warn); border-color: var(--warn); }

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
      .state-grid { grid-template-columns: repeat(2, 1fr); }
    }
  `;

  render() {
    const connected = this.connStatus === 'connected';
    const s = this.liveState;

    return html`
      <main>
        <div class="page-header">
          <div class="logo-icon">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 2a8 8 0 110 16A8 8 0 0112 4zm0 3a5 5 0 100 10A5 5 0 0012 7zm0 2a3 3 0 110 6 3 3 0 010-6z"/></svg>
          </div>
          <span class="page-title">Status</span>
        </div>

        <div class="content">

          ${!connected ? html`
            <div class="disconnected-notice">
              <span>Device not connected.</span>
              <a href="${resolveRouterPath('connect')}">Go to Connect →</a>
            </div>
          ` : ''}

          <!-- Live state -->
          <div class="card">
            <div class="card-title">Live State</div>
            ${s ? html`
              <div class="sampling-badge" style="color:${this._samplingColor(s.samplingState)};border-color:${this._samplingColor(s.samplingState)}">
                ${s.samplingState}
              </div>
              <div class="state-grid">
                <div class="state-cell"><div class="state-label">Voltage</div><div class="state-value">${this._fmt(s.voltage, 2, 'V')}</div></div>
                <div class="state-cell"><div class="state-label">Current</div><div class="state-value">${this._fmt(s.current, 3, 'A')}</div></div>
                <div class="state-cell"><div class="state-label">SoC</div><div class="state-value">${this._fmt(s.soc, 1, '%')}</div></div>
                <div class="state-cell"><div class="state-label">Power</div><div class="state-value">${this._fmt(s.power, 2, 'W')}</div></div>
                <div class="state-cell"><div class="state-label">TTE</div><div class="state-value">${this._fmt(s.tte, 2, 'h')}</div></div>
                <div class="state-cell"><div class="state-label">Fan RPM</div><div class="state-value">${this._fmt(s.fanRpm, 0, '')}</div></div>
                <div class="state-cell"><div class="state-label">Temp</div><div class="state-value">${this._fmt(s.temperature, 1, '°C')}</div></div>
                <div class="state-cell"><div class="state-label">Humidity</div><div class="state-value">${this._fmt(s.humidity, 1, '%RH')}</div></div>
                <div class="state-cell"><div class="state-label">Pressure</div><div class="state-value">${this._fmt(s.pressure, 0, 'Pa')}</div></div>
                <div class="state-cell"><div class="state-label">Servo</div><div class="state-value">${this._fmt(s.servoMm, 2, 'mm')}</div></div>
                <div class="state-cell"><div class="state-label">Flowrate</div><div class="state-value">${this._fmt(s.flowrate, 4, 'L/s')}</div></div>
                <div class="state-cell"><div class="state-label">Flow SP</div><div class="state-value">${this._fmt(s.flowrateSP, 4, 'L/s')}</div></div>
              </div>
              <div class="ts-line">${s.ts}</div>
            ` : html`
              <p style="font-family:var(--mono);font-size:0.75rem;color:var(--muted);">Waiting for state broadcast…</p>
            `}
          </div>

          <!-- System log -->
          <div class="card">
            <div class="log-header">
              <div class="card-title" style="margin-bottom:0">System Log</div>
              ${this.sysLog.length > 0 ? html`
                <button class="btn-clear-log" @click=${() => { bleService.sysLog = []; this.sysLog = []; }}>Clear</button>
              ` : ''}
            </div>
            <div class="sys-log">
              ${this.sysLog.length === 0
                ? html`<p class="sys-entry">No entries yet.</p>`
                : this.sysLog.map(l => html`<p class="sys-entry">${l}</p>`)}
            </div>
          </div>

          <div><a class="nav-back" href="${resolveRouterPath()}">← Back to Home</a></div>

        </div>
      </main>
    `;
  }
}
