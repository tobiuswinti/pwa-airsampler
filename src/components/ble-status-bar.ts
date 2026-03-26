import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { bleService, ConnStatus, LiveState } from '../ble-service';
import { resolveRouterPath } from '../router';

@customElement('ble-status-bar')
export class BleStatusBar extends LitElement {

  @state() private connStatus: ConnStatus = bleService.connStatus;
  @state() private liveState: LiveState | null = bleService.liveState;

  private _onStatus  = () => { this.connStatus = bleService.connStatus; };
  private _onState   = () => { this.liveState  = bleService.liveState; };

  connectedCallback() {
    super.connectedCallback();
    bleService.addEventListener('status-changed', this._onStatus);
    bleService.addEventListener('state-changed',  this._onState);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    bleService.removeEventListener('status-changed', this._onStatus);
    bleService.removeEventListener('state-changed',  this._onState);
  }

  static styles = css`
    :host {
      --bg:      #08090d;
      --surface: #0b0d14;
      --border:  #1e2535;
      --accent:  #00e5ff;
      --ok:      #00ffa3;
      --warn:    #ff6b35;
      --text:    #c8d6ef;
      --muted:   #4a5568;
      --mono:    'Share Tech Mono', monospace;
      --display: 'Oxanium', sans-serif;

      display: block;
      position: sticky;
      top: 0;
      z-index: 200;
    }

    .bar {
      background: rgba(8, 9, 13, 0.92);
      border-bottom: 1px solid var(--border);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      height: 48px;
      display: flex;
      align-items: center;
      padding: 0 16px;
      gap: 10px;
    }

    .status-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .status-dot.disconnected { background: #d13a30; }
    .status-dot.connecting   { background: orange; animation: blink 1s infinite; }
    .status-dot.connected    { background: var(--ok); box-shadow: 0 0 6px rgba(0,255,163,0.6); }
    .status-dot.failed       { background: #d13a30; }

    @keyframes blink { 50% { opacity: 0.25; } }

    .status-label {
      font-family: var(--mono);
      font-size: 0.68rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      flex-shrink: 0;
    }

    .status-label.disconnected { color: #d13a30; }
    .status-label.connecting   { color: orange; }
    .status-label.connected    { color: var(--ok); }
    .status-label.failed       { color: #d13a30; }

    .divider {
      width: 1px;
      height: 20px;
      background: var(--border);
      flex-shrink: 0;
    }

    .badges {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow: hidden;
    }

    .badge {
      font-family: var(--mono);
      font-size: 0.65rem;
      letter-spacing: 0.06em;
      padding: 3px 8px;
      border-radius: 12px;
      border: 1px solid currentColor;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .badge.state-running { color: var(--ok); }
    .badge.state-paused  { color: var(--warn); }
    .badge.state-waiting { color: orange; }
    .badge.state-idle    { color: var(--muted); }

    .value {
      font-family: var(--mono);
      font-size: 0.65rem;
      color: var(--text);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .value span { color: var(--muted); }

    .spacer { flex: 1; }

    .btn {
      font-family: var(--display);
      font-size: 0.68rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 6px 14px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      transition: opacity 0.2s;
      flex-shrink: 0;
    }

    .btn:hover    { opacity: 0.82; }
    .btn:disabled { opacity: 0.3; cursor: not-allowed; }

    .btn-connect {
      background: linear-gradient(135deg, #7c3aed, #00e5ff);
      color: #fff;
      text-decoration: none;
      display: inline-block;
    }

    .btn-disconnect {
      background: transparent;
      border: 1px solid var(--warn);
      color: var(--warn);
    }

    @media (max-width: 400px) {
      .value { display: none; }
    }
  `;

  render() {
    const connected = this.connStatus === 'connected';
    const s = this.liveState;

    return html`
      <div class="bar">
        <span class="status-dot ${this.connStatus}"></span>
        <span class="status-label ${this.connStatus}">
          ${this.connStatus === 'connected'    ? 'Connected'
          : this.connStatus === 'connecting'   ? 'Connecting…'
          : this.connStatus === 'failed'       ? 'Failed'
          : 'AirSampler'}
        </span>

        <div class="spacer"></div>

        ${connected && s ? html`
          <div class="badges">
            <span class="value"><span>RH </span>${s.humidity.toFixed(0)}%</span>
            <span class="value"><span>T </span>${s.temperature.toFixed(1)}°C</span>
            <span class="value"><span>Flow </span>${s.flowrate.toFixed(3)} L/s</span>
            <span class="value"><span>SoC </span>${s.soc.toFixed(1)}%</span>
            <span class="badge state-${s.samplingState}">${s.samplingState}</span>
          </div>
          <div class="divider"></div>
        ` : ''}

        ${connected
          ? html`<button class="btn btn-disconnect" @click=${() => bleService.disconnect()}>Disconnect</button>`
          : html`<a class="btn btn-connect" href="${resolveRouterPath('connect')}">
              ${this.connStatus === 'connecting' ? 'Connecting…' : 'Connect'}
            </a>`
        }
      </div>
    `;
  }
}
