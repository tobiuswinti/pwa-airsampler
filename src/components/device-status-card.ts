import { LitElement, css, html } from 'lit';
import { state, customElement, property } from 'lit/decorators.js';
import { bleService, ConnStatus, LiveState } from '../ble-service';
import { resolveRouterPath } from '../router';

@customElement('device-status-card')
export class DeviceStatusCard extends LitElement {

  @property() href = '';

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
      --border:   #58585f;
      --fg:       #fafafa;
      --muted-fg: #c4c4cc;
      --card:     #111113;
      --sans: 'Geist', 'Inter', system-ui, sans-serif;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    .card.clickable { cursor: pointer; }
    .card.clickable:hover { background: #18181b; border-color: #52525b; }

    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      transition: background 0.15s, border-color 0.15s;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      font-family: var(--sans);
    }

    /* ── Top row: dot + label + state badge ── */
    .top-row {
      display: flex;
      align-items: center;
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

    .device-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--fg);
      flex: 1;
      min-width: 0;
    }

    .device-label.muted { color: var(--muted-fg); font-weight: 400; }

    .sampling-badge {
      font-size: 0.6875rem;
      font-weight: 500;
      letter-spacing: 0.05em;
      padding: 2px 8px;
      border-radius: 8px;
      border: 1px solid;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .sampling-badge.running  { color: #22c55e; border-color: rgba(34,197,94,0.3);  background: rgba(34,197,94,0.08);  }
    .sampling-badge.paused   { color: #f97316; border-color: rgba(249,115,22,0.3); background: rgba(249,115,22,0.08); }
    .sampling-badge.waiting  { color: #3b82f6; border-color: rgba(59,130,246,0.3); background: rgba(59,130,246,0.08); }
    .sampling-badge.opening  { color: #f59e0b; border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.08); }
    .sampling-badge.resuming { color: #8b5cf6; border-color: rgba(139,92,246,0.3); background: rgba(139,92,246,0.08); }
    .sampling-badge.closing  { color: #eab308; border-color: rgba(234,179,8,0.3);  background: rgba(234,179,8,0.08);  }
    .sampling-badge.idle     { color: #52525b; border-color: #3f3f46; background: transparent; }

    /* ── Bottom row: metrics + button ── */
    .bottom-row {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .metrics {
      display: flex;
      align-items: center;
      gap: 14px;
      flex: 1;
      min-width: 0;
      flex-wrap: wrap;
    }

    .metric {
      font-size: 0.8125rem;
      color: var(--muted-fg);
      white-space: nowrap;
    }

    .metric b {
      color: var(--fg);
      font-weight: 500;
    }

    .battery {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .btn {
      font-family: var(--sans);
      font-size: 0.75rem;
      font-weight: 500;
      padding: 5px 12px;
      border-radius: 6px;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
      transition: opacity 0.15s, border-color 0.15s, color 0.15s;
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

    @media (max-width: 380px) {
      .metric:not(.metric-batt) { display: none; }
    }
  `;

  private _batteryColor(soc: number) {
    return soc > 50 ? '#22c55e' : soc > 20 ? '#f59e0b' : '#ef4444';
  }

  private _batteryIcon(soc: number) {
    const color  = this._batteryColor(soc);
    const fillW  = Math.round((soc / 100) * 16);
    return html`
      <svg width="22" height="11" viewBox="0 0 24 12" fill="none">
        <rect x="0.5" y="0.5" width="20" height="11" rx="2.5" stroke="#52525b" stroke-width="1"/>
        <rect x="21" y="3.5" width="2.5" height="5" rx="1" fill="#52525b"/>
        <rect x="2" y="2" width="${fillW}" height="8" rx="1.5" fill="${color}"/>
      </svg>
    `;
  }

  private _navigate(e: Event) {
    if (!this.href) return;
    // Don't navigate if a button/anchor inside was clicked
    if ((e.target as Element).closest('button,a')) return;
    window.location.href = this.href;
  }

  render() {
    const connected = this.connStatus === 'connected';
    const s = this.liveState;

    const label = this.connStatus === 'connected'  ? 'AirSampler'
                : this.connStatus === 'connecting' ? 'Connecting…'
                : this.connStatus === 'failed'     ? 'Connection failed'
                : 'Not connected';

    return html`
      <div class="card ${this.href ? 'clickable' : ''}" @click=${this._navigate}>
        <div class="top-row">
          <span class="conn-dot ${this.connStatus}"></span>
          <span class="device-label ${connected ? '' : 'muted'}">${label}</span>
          ${connected && s
            ? html`<span class="sampling-badge ${s.samplingState.toLowerCase()}">${s.samplingState}</span>`
            : ''}
        </div>

        ${connected && s ? html`
          <div class="bottom-row">
            <div class="metrics">
              <span class="battery metric metric-batt">
                ${this._batteryIcon(s.soc)}
                <b style="color:${this._batteryColor(s.soc)}">${s.soc.toFixed(0)}%</b>
              </span>
              <span class="metric"><b>${s.temperature.toFixed(1)}</b>°C</span>
              <span class="metric"><b>${s.humidity.toFixed(0)}</b>%RH</span>
              <span class="metric"><b>${s.flowrate.toFixed(3)}</b> L/s</span>
            </div>
            <button class="btn btn-disconnect" @click=${() => bleService.disconnect()}>Disconnect</button>
          </div>
        ` : html`
          <div class="bottom-row">
            <div class="metrics"></div>
            <a class="btn btn-connect" href="${resolveRouterPath('connect')}">
              ${this.connStatus === 'connecting' ? 'Connecting…' : 'Connect'}
            </a>
          </div>
        `}
      </div>
    `;
  }
}
