import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { authService } from '../auth-service';
import { bleService, ConnStatus, LiveState } from '../ble-service';
import { resolveRouterPath } from '../router';

@customElement('app-top-bar')
export class AppTopBar extends LitElement {

  @state() private _user     = authService.user;
  @state() private _isAdmin  = authService.isAdmin;
  @state() private _conn: ConnStatus      = bleService.connStatus;
  @state() private _live: LiveState | null = bleService.liveState;

  private _onAuth   = () => { this._user = authService.user; this._isAdmin = authService.isAdmin; };
  private _onStatus = () => { this._conn = bleService.connStatus; };
  private _onState  = () => { this._live = bleService.liveState; };

  connectedCallback() {
    super.connectedCallback();
    authService.addEventListener('auth-changed',  this._onAuth);
    bleService.addEventListener('status-changed', this._onStatus);
    bleService.addEventListener('state-changed',  this._onState);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    authService.removeEventListener('auth-changed',  this._onAuth);
    bleService.removeEventListener('status-changed', this._onStatus);
    bleService.removeEventListener('state-changed',  this._onState);
  }

  static styles = css`
    :host {
      display: block;
      position: sticky;
      top: 0;
      z-index: 200;
      --border:   #2e2e33;
      --fg:       #fafafa;
      --muted-fg: #71717a;
      --sans: 'Geist', 'Inter', system-ui, sans-serif;
    }

    .bar {
      background: rgba(9,9,11,0.9);
      border-bottom: 1px solid var(--border);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      height: 44px;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      padding: 0 16px;
    }

    .bar-inner {
      display: contents;
    }

    /* ── Left: app name ── */
    .app-name {
      font-family: var(--sans);
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--fg);
      letter-spacing: 0.01em;
      justify-self: start;
    }

    /* ── Center: device status ── */
    .device-status {
      display: flex;
      align-items: center;
      gap: 6px;
      justify-self: center;
    }

    .conn-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .conn-dot.connected    { background: #22c55e; box-shadow: 0 0 4px #22c55e88; }
    .conn-dot.disconnected { background: #3f3f46; }
    .conn-dot.connecting   { background: #f59e0b; animation: pulse 1s infinite; }
    .conn-dot.failed       { background: #ef4444; }

    @keyframes pulse { 50% { opacity: 0.25; } }

    .state-badge {
      font-family: var(--sans);
      font-size: 0.6875rem;
      font-weight: 500;
      letter-spacing: 0.04em;
      padding: 2px 7px;
      border-radius: 8px;
      border: 1px solid;
    }

    .state-badge.running  { color: #22c55e; border-color: rgba(34,197,94,0.3);  background: rgba(34,197,94,0.08);  }
    .state-badge.paused   { color: #f97316; border-color: rgba(249,115,22,0.3); background: rgba(249,115,22,0.08); }
    .state-badge.waiting  { color: #3b82f6; border-color: rgba(59,130,246,0.3); background: rgba(59,130,246,0.08); }
    .state-badge.opening  { color: #f59e0b; border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.08); }
    .state-badge.resuming { color: #8b5cf6; border-color: rgba(139,92,246,0.3); background: rgba(139,92,246,0.08); }
    .state-badge.closing  { color: #eab308; border-color: rgba(234,179,8,0.3);  background: rgba(234,179,8,0.08);  }

    .batt {
      font-family: var(--sans);
      font-size: 0.75rem;
      font-weight: 500;
    }

    .btn-connect {
      font-family: var(--sans);
      font-size: 0.72rem;
      font-weight: 500;
      padding: 3px 10px;
      border-radius: 5px;
      border: 1px solid #3f3f46;
      background: transparent;
      color: var(--muted-fg);
      text-decoration: none;
      transition: border-color 0.15s, color 0.15s;
      white-space: nowrap;
    }

    .btn-connect:hover { border-color: #52525b; color: var(--fg); }

    .conn-label {
      font-family: var(--sans);
      font-size: 0.75rem;
      color: var(--muted-fg);
    }


    /* ── Right: user ── */
    .user-wrap {
      display: flex;
      align-items: center;
      gap: 7px;
      justify-self: end;
    }

    .avatar {
      width: 22px; height: 22px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .avatar-placeholder {
      width: 22px; height: 22px;
      border-radius: 50%;
      background: #3f3f46;
      flex-shrink: 0;
    }

    .role-badge {
      font-family: var(--sans);
      font-size: 0.6rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(34,197,94,0.1);
      border: 1px solid rgba(34,197,94,0.25);
      color: #22c55e;
      flex-shrink: 0;
    }

    .btn-signout {
      font-family: var(--sans);
      font-size: 0.72rem;
      color: var(--muted-fg);
      background: transparent;
      border: 1px solid #3f3f46;
      border-radius: 5px;
      padding: 3px 9px;
      cursor: pointer;
      flex-shrink: 0;
      transition: border-color 0.15s, color 0.15s;
    }

    .btn-signout:hover { border-color: #52525b; color: var(--fg); }

    @media (max-width: 400px) {
      .btn-signout { display: none; }
    }
  `;

  private _battColor(soc: number) {
    return soc > 50 ? '#22c55e' : soc > 20 ? '#f59e0b' : '#ef4444';
  }

  render() {
    const u    = this._user;
    const live = this._live;
    const conn = this._conn;
    const connected = conn === 'connected';
    const ss   = live?.samplingState?.toLowerCase() ?? '';
    const notIdle = ss && ss !== 'idle';

    return html`
      <div class="bar">
       <div class="bar-inner">

        <!-- Left -->
        <span class="app-name">AirSampler</span>

        <!-- Center -->
        <div class="device-status">
          <span class="conn-dot ${conn}"></span>
          ${connected && live ? html`
            ${notIdle ? html`<span class="state-badge ${ss}">${ss.toUpperCase()}</span>` : ''}
            <span class="batt" style="color:${this._battColor(live.soc)}">${live.soc.toFixed(0)}%</span>
          ` : conn === 'connecting' ? html`
            <span class="conn-label">Connecting…</span>
          ` : html`
            <a class="btn-connect" href="${resolveRouterPath('connect')}">Connect</a>
          `}
        </div>

        <!-- Right -->
        ${u ? html`
          <div class="user-wrap">
            ${this._isAdmin ? html`<span class="role-badge">Admin</span>` : ''}
            ${u.photoURL
              ? html`<img class="avatar" src="${u.photoURL}" alt="">`
              : html`<div class="avatar-placeholder"></div>`}
            <button class="btn-signout" @click=${() => authService.signOut()}>Sign out</button>
          </div>
        ` : html`<div></div>`}

       </div>
      </div>
    `;
  }
}
