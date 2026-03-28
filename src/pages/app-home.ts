import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import { bleService, ConnStatus, LiveState } from '../ble-service';
import { getDeviceRuns, onDeviceRunsChanged } from '../device-log-store';
import { authService } from '../auth-service';

@customElement('app-home')
export class AppHome extends LitElement {

  @state() private connStatus: ConnStatus = bleService.connStatus;
  @state() private liveState: LiveState | null = bleService.liveState;
  @state() private unsyncedCount: number = bleService.unsyncedCount;
  @state() private pendingUpload: number = getDeviceRuns().filter(r => !r.firebaseId).length;
  @state() private adminMode: boolean = authService.isAdmin;

  private _onStatus    = () => { this.connStatus    = bleService.connStatus; };
  private _onState     = () => { this.liveState     = bleService.liveState; };
  private _onSyncCheck = () => { this.unsyncedCount = bleService.unsyncedCount; };
  private _onRuns      = () => { this.pendingUpload = getDeviceRuns().filter(r => !r.firebaseId).length; };
  private _onAuth      = () => { this.adminMode     = authService.isAdmin; };
  private _unsubRuns: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    bleService.addEventListener('status-changed',     this._onStatus);
    bleService.addEventListener('state-changed',      this._onState);
    bleService.addEventListener('sync-check-changed', this._onSyncCheck);
    authService.addEventListener('auth-changed',      this._onAuth);
    this._unsubRuns = onDeviceRunsChanged(this._onRuns);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    bleService.removeEventListener('status-changed',     this._onStatus);
    bleService.removeEventListener('state-changed',      this._onState);
    bleService.removeEventListener('sync-check-changed', this._onSyncCheck);
    authService.removeEventListener('auth-changed',      this._onAuth);
    this._unsubRuns?.();
  }

  static styles = css`
    :host {
      --bg:       #09090b;
      --card:     #111113;
      --border:   #3f3f46;
      --fg:       #fafafa;
      --muted-fg: #a1a1aa;
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

    .content {
      width: 100%;
      max-width: 480px;
      padding: 20px 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    /* ── Section label ── */
    .section-label {
      font-size: 0.6875rem;
      font-weight: 500;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: #52525b;
      padding: 10px 2px 4px;
    }

    /* ── Nav card ── */
    .nav-card {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--card);
      text-decoration: none;
      color: var(--fg);
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s, transform 0.1s;
    }

    .nav-card:hover {
      background: #18181b;
      border-color: #52525b;
      transform: translateY(-1px);
    }

    .nav-card:active { transform: translateY(0); }

    .nav-card.disabled {
      opacity: 0.3;
      pointer-events: none;
    }

    .nav-card.primary {
      background: #18181b;
      border-color: #52525b;
    }

    .nav-card.primary:hover {
      background: #1c1c1f;
      border-color: #71717a;
    }

    .nav-card.danger { border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.04); }
    .nav-card.danger:hover { border-color: rgba(239,68,68,0.5); background: rgba(239,68,68,0.08); transform: none; }

    /* ── Icon ── */
    .nav-icon {
      width: 40px; height: 40px;
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }

    .nav-icon svg { width: 20px; height: 20px; }

    /* ── Text ── */
    .nav-text {
      display: flex;
      flex-direction: column;
      gap: 3px;
      flex: 1;
      min-width: 0;
    }

    .nav-label {
      font-size: 0.9375rem;
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .nav-label.danger { color: #fca5a5; }

    .nav-desc {
      font-size: 0.75rem;
      color: var(--muted-fg);
    }

    /* ── Right side ── */
    .nav-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .nav-arrow {
      color: #52525b;
      font-size: 1.1rem;
      transition: transform 0.15s, color 0.15s;
    }

    .nav-card:hover .nav-arrow { transform: translateX(2px); color: var(--muted-fg); }
    .nav-card.danger .nav-arrow { color: rgba(239,68,68,0.4); }

    .nav-badge {
      font-size: 0.6875rem;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 10px;
      background: rgba(245,158,11,0.12);
      border: 1px solid rgba(245,158,11,0.3);
      color: #f59e0b;
    }

    .footer-note {
      font-size: 0.72rem;
      color: #3f3f46;
      text-align: center;
      padding: 16px 0 0;
      line-height: 1.6;
    }
  `;

  render() {
    const connected  = this.connStatus === 'connected';
    const sampState  = this.liveState?.samplingState;
    const isSampling = connected && !!sampState && sampState !== 'IDLE';
    const syncBadge  = this.unsyncedCount + this.pendingUpload;

    return html`
      <main>
        <div class="content">

          <span class="section-label">Actions</span>

          ${isSampling
            ? html`
              <div class="nav-card danger" @click=${() => bleService.sendCmd('stopSampling')}>
                <div class="nav-icon" style="background:rgba(239,68,68,0.08);">
                  <svg viewBox="0 0 24 24" fill="#ef4444"><path d="M6 6h12v12H6z"/></svg>
                </div>
                <div class="nav-text">
                  <span class="nav-label danger">Stop Sampling</span>
                  <span class="nav-desc">Sampling is currently active</span>
                </div>
                <div class="nav-right"><span class="nav-arrow">›</span></div>
              </div>`
            : html`
              <a class="nav-card primary" href="${resolveRouterPath('control')}">
                <div class="nav-icon" style="background:rgba(255,255,255,0.06);">
                  <svg viewBox="0 0 24 24" fill="#e4e4e7"><path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm-1 14V8l6 4-6 4z"/></svg>
                </div>
                <div class="nav-text">
                  <span class="nav-label">Start Sampling</span>
                  <span class="nav-desc">Configure &amp; launch a sampling run</span>
                </div>
                <div class="nav-right"><span class="nav-arrow">›</span></div>
              </a>`
          }

          <a class="nav-card" href="${resolveRouterPath('sync')}">
            <div class="nav-icon" style="background:rgba(255,255,255,0.06);">
              <svg viewBox="0 0 24 24" fill="#a1a1aa">
                <path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
              </svg>
            </div>
            <div class="nav-text">
              <span class="nav-label">Download Sample Data</span>
              <span class="nav-desc">Fetch new sampling runs from device</span>
            </div>
            <div class="nav-right">
              ${syncBadge > 0 ? html`<span class="nav-badge">${syncBadge}</span>` : ''}
              <span class="nav-arrow">›</span>
            </div>
          </a>

          <a class="nav-card " href="${resolveRouterPath('status')}">
            <div class="nav-icon" style="background:rgba(255,255,255,0.06);">
              <svg viewBox="0 0 24 24" fill="#a1a1aa"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
            </div>
            <div class="nav-text">
              <span class="nav-label">Device Status</span>
              <span class="nav-desc">Live sensor readings &amp; device state</span>
            </div>
            <div class="nav-right"><span class="nav-arrow">›</span></div>
          </a>

          <span class="section-label">Data</span>

          <a class="nav-card" href="${resolveRouterPath('lookup')}">
            <div class="nav-icon" style="background:rgba(255,255,255,0.06);">
              <svg viewBox="0 0 24 24" fill="#a1a1aa"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            </div>
            <div class="nav-text">
              <span class="nav-label">Sample Lookup</span>
              <span class="nav-desc">Find runs by NFC tag or sample ID</span>
            </div>
            <div class="nav-right"><span class="nav-arrow">›</span></div>
          </a>

          ${this.adminMode ? html`
            <span class="section-label">Admin</span>

            <a class="nav-card" href="${resolveRouterPath('admin-runs')}">
              <div class="nav-icon" style="background:rgba(255,255,255,0.06);">
                <svg viewBox="0 0 24 24" fill="#a1a1aa"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/></svg>
              </div>
              <div class="nav-text">
                <span class="nav-label">All Sample Runs</span>
                <span class="nav-desc">Browse, search and delete cloud runs</span>
              </div>
              <div class="nav-right"><span class="nav-arrow">›</span></div>
            </a>

            <a class="nav-card " href="${resolveRouterPath('admin')}">
              <div class="nav-icon" style="background:rgba(255,255,255,0.06);">
                <svg viewBox="0 0 24 24" fill="#a1a1aa"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
              </div>
              <div class="nav-text">
                <span class="nav-label">Device Actions</span>
                <span class="nav-desc">Fan, servo, log management</span>
              </div>
              <div class="nav-right"><span class="nav-arrow">›</span></div>
            </a>
          ` : ''}

          <span class="section-label">About</span>

          <a class="nav-card" href="${resolveRouterPath('about')}">
            <div class="nav-icon" style="background:rgba(255,255,255,0.06);">
              <svg viewBox="0 0 24 24" fill="#a1a1aa"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
            </div>
            <div class="nav-text">
              <span class="nav-label">About</span>
              <span class="nav-desc">Project info &amp; documentation</span>
            </div>
            <div class="nav-right"><span class="nav-arrow">›</span></div>
          </a>

          <p class="footer-note">Requires Chrome on Android for BLE &amp; NFC features.</p>

        </div>
      </main>
    `;
  }
}
