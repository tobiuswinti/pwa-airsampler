import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { bleService, ConnStatus, LiveState } from '../ble-service';
import { resolveRouterPath } from '../router';

@customElement('ble-status-bar')
export class BleStatusBar extends LitElement {

  @state() private connStatus: ConnStatus = bleService.connStatus;
  @state() private liveState: LiveState | null = bleService.liveState;

  private _onStatus = () => { this.connStatus = bleService.connStatus; };
  private _onState  = () => { this.liveState  = bleService.liveState; };

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
      display: block;
      position: sticky;
      top: 0;
      z-index: 200;
      --border:   #27272a;
      --fg:       #fafafa;
      --muted-fg: #71717a;
      --mono: 'Share Tech Mono', monospace;
      --sans: 'Geist', 'Inter', system-ui, sans-serif;
    }

    .bar {
      background: rgba(9,9,11,0.88);
      border-bottom: 1px solid var(--border);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      height: 44px;
      display: flex;
      align-items: center;
      padding: 0 16px;
      gap: 8px;
    }

    .conn-dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .conn-dot.connected    { background: #22c55e; box-shadow: 0 0 5px #22c55e88; }
    .conn-dot.disconnected { background: #52525b; }
    .conn-dot.connecting   { background: #f59e0b; animation: pulse 1s infinite; }
    .conn-dot.failed       { background: #ef4444; }

    @keyframes pulse { 50% { opacity: 0.25; } }

    .conn-label {
      font-family: var(--sans);
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--fg);
      flex-shrink: 0;
    }

    .conn-label.disconnected,
    .conn-label.failed { color: var(--muted-fg); }

    .sep {
      width: 1px;
      height: 16px;
      background: var(--border);
      flex-shrink: 0;
      margin: 0 2px;
    }

    .metrics {
      display: flex;
      align-items: center;
      gap: 12px;
      overflow: hidden;
    }

    .metric {
      font-family: var(--mono);
      font-size: 0.7rem;
      color: var(--muted-fg);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .metric b {
      color: var(--fg);
      font-weight: 500;
    }

    .sampling-badge {
      font-family: var(--mono);
      font-size: 0.65rem;
      letter-spacing: 0.05em;
      padding: 2px 8px;
      border-radius: 10px;
      border: 1px solid;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .sampling-badge.running { color: #22c55e; border-color: rgba(34,197,94,0.3); background: rgba(34,197,94,0.08); }
    .sampling-badge.paused  { color: #f59e0b; border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.08); }
    .sampling-badge.waiting { color: #3b82f6; border-color: rgba(59,130,246,0.3); background: rgba(59,130,246,0.08); }
    .sampling-badge.idle    { color: #52525b; border-color: #3f3f46; }

    .spacer { flex: 1; }

    .btn {
      font-family: var(--sans);
      font-size: 0.75rem;
      font-weight: 500;
      padding: 5px 14px;
      border-radius: 5px;
      cursor: pointer;
      transition: opacity 0.15s;
      flex-shrink: 0;
      white-space: nowrap;
    }

    .btn-connect {
      background: var(--fg);
      color: #09090b;
      border: none;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
    }

    .btn-connect:hover { opacity: 0.88; }

    .btn-disconnect {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--muted-fg);
    }

    .btn-disconnect:hover { border-color: #ef4444; color: #f87171; }

    @media (max-width: 420px) {
      .metric { display: none; }
    }
  `;

  render() {
    const connected = this.connStatus === 'connected';
    const s = this.liveState;

    return html`
      <div class="bar">
        <span class="conn-dot ${this.connStatus}"></span>
        <span class="conn-label ${this.connStatus}">
          ${this.connStatus === 'connected'  ? 'AirSampler'
          : this.connStatus === 'connecting' ? 'Connecting…'
          : this.connStatus === 'failed'     ? 'Failed'
          : 'Not connected'}
        </span>

        ${connected && s ? html`
          <div class="sep"></div>
          <div class="metrics">
            <span class="metric"><b>${s.soc.toFixed(0)}</b>%</span>
            <span class="metric"><b>${s.temperature.toFixed(1)}</b>°C</span>
            <span class="metric"><b>${s.flowrate.toFixed(3)}</b> L/s</span>
          </div>
          <span class="sampling-badge ${s.samplingState}">${s.samplingState}</span>
        ` : ''}

        <div class="spacer"></div>

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
