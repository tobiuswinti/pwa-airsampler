import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import { bleService, ConnStatus, LiveState } from '../ble-service';
import { getDeviceRuns, onDeviceRunsChanged } from '../device-log-store';

@customElement('app-home')
export class AppHome extends LitElement {

  @state() private connStatus: ConnStatus = bleService.connStatus;
  @state() private liveState: LiveState | null = bleService.liveState;
  @state() private unsyncedCount: number = bleService.unsyncedCount;
  @state() private pendingUpload: number = getDeviceRuns().filter(r => !r.firebaseId).length;
  @state() private adminMode: boolean = localStorage.getItem('adminMode') === 'true';

  private _onStatus    = () => { this.connStatus    = bleService.connStatus; };
  private _onState     = () => { this.liveState     = bleService.liveState; };
  private _onSyncCheck = () => { this.unsyncedCount = bleService.unsyncedCount; };
  private _onRuns      = () => { this.pendingUpload = getDeviceRuns().filter(r => !r.firebaseId).length; };
  private _unsubRuns: (() => void) | null = null;

  private _toggleAdmin() {
    this.adminMode = !this.adminMode;
    localStorage.setItem('adminMode', String(this.adminMode));
  }

  connectedCallback() {
    super.connectedCallback();
    bleService.addEventListener('status-changed',     this._onStatus);
    bleService.addEventListener('state-changed',      this._onState);
    bleService.addEventListener('sync-check-changed', this._onSyncCheck);
    this._unsubRuns = onDeviceRunsChanged(this._onRuns);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    bleService.removeEventListener('status-changed',     this._onStatus);
    bleService.removeEventListener('state-changed',      this._onState);
    bleService.removeEventListener('sync-check-changed', this._onSyncCheck);
    this._unsubRuns?.();
  }

  static styles = css`
    :host {
      --bg:       #09090b;
      --card:     #111113;
      --border:   #58585f;
      --fg:       #fafafa;
      --muted-fg: #c4c4cc;
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
      max-width: 480px;
      padding: 28px 20px 4px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .app-name {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--fg);
      letter-spacing: 0.01em;
    }

    .conn-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .conn-dot.connected    { background: #22c55e; box-shadow: 0 0 6px #22c55e88; }
    .conn-dot.disconnected { background: var(--muted-fg); }
    .conn-dot.connecting   { background: #f59e0b; animation: blink 0.8s infinite; }
    .conn-dot.failed       { background: #ef4444; }

    @keyframes blink { 50% { opacity: 0.3; } }

    .content {
      width: 100%;
      max-width: 480px;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .group-label {
      font-size: 0.6875rem;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted-fg);
      padding: 12px 2px 6px;
    }

    /* ── Nav cards ── */
    .nav-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 13px 14px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--card);
      text-decoration: none;
      color: var(--fg);
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
      margin-bottom: 4px;
    }

    .nav-card:hover { background: #18181b; border-color: #3f3f46; }

    .nav-card.disabled {
      opacity: 0.38;
      pointer-events: none;
    }

    .nav-card.danger:hover { border-color: #ef4444; }

    .nav-icon {
      width: 36px; height: 36px;
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }

    .nav-icon svg { width: 18px; height: 18px; }

    .nav-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }

    .nav-label {
      font-size: 0.875rem;
      font-weight: 500;
      letter-spacing: -0.01em;
    }

    .nav-desc {
      font-size: 0.75rem;
      color: var(--muted-fg);
    }

    .nav-arrow {
      color: var(--muted-fg);
      font-size: 1rem;
      flex-shrink: 0;
      transition: transform 0.15s;
    }

    .nav-card:hover .nav-arrow { transform: translateX(2px); }

    .separator {
      height: 1px;
      background: var(--border);
      margin: 10px 0 0;
    }

    .nav-badge {
      font-size: 0.6875rem;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 10px;
      background: rgba(245,158,11,0.15);
      border: 1px solid rgba(245,158,11,0.35);
      color: #f59e0b;
      flex-shrink: 0;
    }

    .footer-note {
      font-size: 0.72rem;
      color: var(--muted-fg);
      text-align: center;
      padding: 20px 0 0;
      line-height: 1.6;
    }

    .admin-toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 2px 0;
    }

    .admin-toggle-label {
      font-size: 0.75rem;
      color: var(--muted-fg);
    }

    .switch {
      position: relative;
      width: 36px;
      height: 20px;
      flex-shrink: 0;
    }

    .switch input { opacity: 0; width: 0; height: 0; }

    .switch-track {
      position: absolute;
      inset: 0;
      border-radius: 10px;
      background: #3f3f46;
      border: 1px solid var(--border);
      cursor: pointer;
      transition: background 0.2s;
    }

    .switch input:checked + .switch-track { background: #22c55e; border-color: #22c55e; }

    .switch-track::after {
      content: '';
      position: absolute;
      top: 2px; left: 2px;
      width: 14px; height: 14px;
      border-radius: 50%;
      background: #fff;
      transition: transform 0.2s;
    }

    .switch input:checked + .switch-track::after { transform: translateX(16px); }
  `;

  render() {
    const connected  = this.connStatus === 'connected';
    const bleClass   = connected ? '' : 'disabled';
    const isSampling = connected && this.liveState?.samplingState === 'running';
    const syncBadge  = this.unsyncedCount + this.pendingUpload;

    return html`
      <main>
        <div class="page-header">
          <span class="app-name">AirSampler</span>
          <span class="conn-dot ${this.connStatus}"></span>
        </div>

        <div class="content">

          <span class="group-label">Actions</span>

          <!-- Connect / Disconnect -->
          ${connected
            ? html`
              <div class="nav-card danger" @click=${() => bleService.disconnect()}>
                <div class="nav-icon" style="background:rgba(239,68,68,0.1);">
                  <svg viewBox="0 0 24 24" fill="#ef4444"><path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/></svg>
                </div>
                <div class="nav-text">
                  <span class="nav-label">Disconnect</span>
                  <span class="nav-desc">Connected to AirSampler</span>
                </div>
                <span class="nav-arrow">›</span>
              </div>`
            : html`
              <a class="nav-card" href="${resolveRouterPath('connect')}">
                <div class="nav-icon" style="background:rgba(255,255,255,0.06);">
                  <svg viewBox="0 0 24 24" fill="#a1a1aa"><path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/></svg>
                </div>
                <div class="nav-text">
                  <span class="nav-label">Connect</span>
                  <span class="nav-desc">Pair with AirSampler via Bluetooth</span>
                </div>
                <span class="nav-arrow">›</span>
              </a>`
          }

          <!-- Start / Stop Sampling -->
          ${isSampling
            ? html`
              <div class="nav-card danger" @click=${() => bleService.sendCmd('stopSampling')}>
                <div class="nav-icon" style="background:rgba(239,68,68,0.1);">
                  <svg viewBox="0 0 24 24" fill="#ef4444"><path d="M6 6h12v12H6z"/></svg>
                </div>
                <div class="nav-text">
                  <span class="nav-label">Stop Sampling</span>
                  <span class="nav-desc">Sampling is currently running</span>
                </div>
                <span class="nav-arrow">›</span>
              </div>`
            : html`
              <a class="nav-card ${bleClass}" href="${resolveRouterPath('control')}">
                <div class="nav-icon" style="background:rgba(255,255,255,0.06);">
                  <svg viewBox="0 0 24 24" fill="#a1a1aa"><path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm-1 14V8l6 4-6 4z"/></svg>
                </div>
                <div class="nav-text">
                  <span class="nav-label">Start Sampling</span>
                  <span class="nav-desc">Configure &amp; start a sampling run</span>
                </div>
                <span class="nav-arrow">›</span>
              </a>`
          }

          <span class="group-label">Monitor</span>

          <a class="nav-card ${bleClass}" href="${resolveRouterPath('status')}">
            <div class="nav-icon" style="background:rgba(255,255,255,0.06);">
              <svg viewBox="0 0 24 24" fill="#a1a1aa"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 2a8 8 0 110 16A8 8 0 0112 4zm0 3a5 5 0 100 10A5 5 0 0012 7zm0 2a3 3 0 110 6 3 3 0 010-6z"/></svg>
            </div>
            <div class="nav-text">
              <span class="nav-label">Status</span>
              <span class="nav-desc">Live sensor state &amp; graphs</span>
            </div>
            <span class="nav-arrow">›</span>
          </a>

          <span class="group-label">Data</span>

          <a class="nav-card" href="${resolveRouterPath('sync')}">
            <div class="nav-icon" style="background:rgba(255,255,255,0.06);">
              <svg viewBox="0 0 24 24" fill="#a1a1aa"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
            </div>
            <div class="nav-text">
              <span class="nav-label">Runs</span>
              <span class="nav-desc">Sync, browse and look up sampling runs</span>
            </div>
            ${syncBadge > 0 ? html`<span class="nav-badge">${syncBadge}</span>` : ''}
            <span class="nav-arrow">›</span>
          </a>

          ${this.adminMode ? html`
            <div class="separator"></div>
            <span class="group-label">Admin</span>

            <a class="nav-card ${bleClass}" href="${resolveRouterPath('ble')}">
              <div class="nav-icon" style="background:rgba(255,255,255,0.06);">
                <svg viewBox="0 0 24 24" fill="#a1a1aa"><path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/></svg>
              </div>
              <div class="nav-text">
                <span class="nav-label">BLE Control</span>
                <span class="nav-desc">Send raw BLE commands to device</span>
              </div>
              <span class="nav-arrow">›</span>
            </a>

            <a class="nav-card ${bleClass}" href="${resolveRouterPath('device')}">
              <div class="nav-icon" style="background:rgba(255,255,255,0.06);">
                <svg viewBox="0 0 24 24" fill="#a1a1aa"><path d="M22 9V7h-2V5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2v-2h-2V9h2zm-4 10H4V5h14v14z"/><path d="M6 13h5v4H6zm6-6h3v3h-3zM6 7h5v5H6zm6 4h3v6h-3z"/></svg>
              </div>
              <div class="nav-text">
                <span class="nav-label">Device Settings</span>
                <span class="nav-desc">Configure device parameters</span>
              </div>
              <span class="nav-arrow">›</span>
            </a>

          ` : ''}

          <a class="nav-card" href="${resolveRouterPath('about')}">
            <div class="nav-icon" style="background:rgba(255,255,255,0.06);">
              <svg viewBox="0 0 24 24" fill="#a1a1aa"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
            </div>
            <div class="nav-text">
              <span class="nav-label">About</span>
              <span class="nav-desc">Project info &amp; documentation</span>
            </div>
            <span class="nav-arrow">›</span>
          </a>

          <div class="admin-toggle-row">
            <span class="admin-toggle-label">Admin mode</span>
            <label class="switch">
              <input type="checkbox" .checked=${this.adminMode} @change=${this._toggleAdmin}>
              <span class="switch-track"></span>
            </label>
          </div>

          <p class="footer-note">Requires Chrome on Android for BLE &amp; NFC features.</p>

        </div>
      </main>
    `;
  }
}
