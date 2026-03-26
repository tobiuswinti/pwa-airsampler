import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import { bleService, ConnStatus, LiveState } from '../ble-service';

@customElement('app-home')
export class AppHome extends LitElement {

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
      box-shadow: 0 0 12px rgba(0,229,255,0.4);
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
      gap: 20px;
    }

    .subtitle {
      font-family: var(--mono);
      font-size: 0.78rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted);
    }

    /* Navigation cards */
    .nav-grid {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .group-label {
      font-family: var(--mono);
      font-size: 0.6rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--muted);
      padding: 0 4px;
      margin-bottom: -6px;
    }

    .nav-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 22px 24px;
      display: flex;
      align-items: center;
      gap: 18px;
      text-decoration: none;
      color: var(--text);
      transition: border-color 0.25s, transform 0.15s, box-shadow 0.25s, opacity 0.25s;
      position: relative;
      overflow: hidden;
      cursor: pointer;
    }

    .nav-card::after {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--accent), transparent);
      opacity: 0;
      transition: opacity 0.25s;
    }

    .nav-card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
      box-shadow: 0 4px 20px rgba(0,229,255,0.12);
    }

    .nav-card:hover::after { opacity: 1; }

    /* Grayed-out cards for BLE-required pages */
    .nav-card.requires-ble:not(.connected) {
      opacity: 0.45;
      pointer-events: none;
      filter: grayscale(0.4);
    }

    .nav-icon {
      width: 48px; height: 48px;
      border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }

    .nav-icon svg { width: 26px; height: 26px; }

    .nav-text { display: flex; flex-direction: column; gap: 4px; }

    .nav-label {
      font-size: 0.95rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .nav-desc {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--muted);
      letter-spacing: 0.04em;
    }

    .nav-arrow {
      margin-left: auto;
      font-size: 1.2rem;
      color: var(--muted);
      transition: color 0.2s, transform 0.2s;
      flex-shrink: 0;
    }

    .nav-card:hover .nav-arrow {
      color: var(--accent);
      transform: translateX(3px);
    }

    .info-tile {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 16px;
    }

    .info-tile h3 {
      font-size: 0.65rem;
      font-family: var(--mono);
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 6px;
    }

    .info-tile p { font-size: 0.8rem; color: var(--text); line-height: 1.5; }

    @media (max-width: 480px) {
      .nav-card { padding: 18px 16px; gap: 14px; }
      .nav-icon { width: 42px; height: 42px; }
      .nav-icon svg { width: 22px; height: 22px; }
    }
  `;

  render() {
    const connected    = this.connStatus === 'connected';
    const bleClass     = `requires-ble${connected ? ' connected' : ''}`;
    const isSampling   = connected && this.liveState?.samplingState === 'running';

    return html`
      <main>
        <div class="page-header">
          <div class="logo-icon">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4a6 6 0 110 12A6 6 0 0112 6zm0 2a4 4 0 100 8 4 4 0 010-8z"/></svg>
          </div>
          <span class="page-title">AirSampler</span>
        </div>

        <div class="content">
          <span class="subtitle">Control Panel — Select Module</span>

          <div class="nav-grid">

            <span class="group-label">Actions</span>

            <!-- Connect / Disconnect toggle -->
            ${connected
              ? html`
                <div class="nav-card" @click=${() => bleService.disconnect()} style="cursor:pointer;">
                  <div class="nav-icon" style="background:rgba(255,107,53,0.08);border:1px solid rgba(255,107,53,0.3);">
                    <svg viewBox="0 0 24 24" style="fill:var(--warn);"><path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/></svg>
                  </div>
                  <div class="nav-text">
                    <span class="nav-label" style="color:var(--warn);">Disconnect</span>
                    <span class="nav-desc">Connected to AirSampler</span>
                  </div>
                  <span class="nav-arrow">›</span>
                </div>`
              : html`
                <a class="nav-card" href="${resolveRouterPath('connect')}">
                  <div class="nav-icon" style="background:rgba(124,58,237,0.12);border:1px solid rgba(124,58,237,0.3);">
                    <svg viewBox="0 0 24 24" style="fill:var(--accent2);"><path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/></svg>
                  </div>
                  <div class="nav-text">
                    <span class="nav-label">Connect</span>
                    <span class="nav-desc">Pair with AirSampler via Bluetooth</span>
                  </div>
                  <span class="nav-arrow">›</span>
                </a>`
            }

            <!-- Start Sampling / Stop Sampling toggle -->
            ${isSampling
              ? html`
                <div class="nav-card" @click=${() => bleService.sendCmd('stopSampling')} style="cursor:pointer;">
                  <div class="nav-icon" style="background:rgba(255,107,53,0.08);border:1px solid rgba(255,107,53,0.3);">
                    <svg viewBox="0 0 24 24" style="fill:var(--warn);"><path d="M6 6h12v12H6z"/></svg>
                  </div>
                  <div class="nav-text">
                    <span class="nav-label" style="color:var(--warn);">Stop Sampling</span>
                    <span class="nav-desc">Sampling currently running</span>
                  </div>
                  <span class="nav-arrow">›</span>
                </div>`
              : html`
                <a class="nav-card ${bleClass}" href="${resolveRouterPath('control')}">
                  <div class="nav-icon" style="background:rgba(0,255,163,0.08);border:1px solid rgba(0,255,163,0.25);">
                    <svg viewBox="0 0 24 24" style="fill:var(--ok);"><path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm-1 14V8l6 4-6 4z"/></svg>
                  </div>
                  <div class="nav-text">
                    <span class="nav-label">Start Sampling</span>
                    <span class="nav-desc">Configure & start a sampling run</span>
                  </div>
                  <span class="nav-arrow">›</span>
                </a>`
            }

            <span class="group-label">Monitor</span>

            <!-- Status -->
            <a class="nav-card ${bleClass}" href="${resolveRouterPath('status')}">
              <div class="nav-icon" style="background:rgba(0,229,255,0.08);border:1px solid rgba(0,229,255,0.25);">
                <svg viewBox="0 0 24 24" style="fill:var(--accent);"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 2a8 8 0 110 16A8 8 0 0112 4zm0 3a5 5 0 100 10A5 5 0 0012 7zm0 2a3 3 0 110 6 3 3 0 010-6z"/></svg>
              </div>
              <div class="nav-text">
                <span class="nav-label">Status</span>
                <span class="nav-desc">Live sensor state & system log</span>
              </div>
              <span class="nav-arrow">›</span>
            </a>

            <span class="group-label">Data</span>

            <!-- RFID -->
            <a class="nav-card" href="${resolveRouterPath('rfid')}">
              <div class="nav-icon" style="background:rgba(0,229,255,0.08);border:1px solid rgba(0,229,255,0.25);">
                <svg viewBox="0 0 24 24" style="fill:var(--accent);"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4a6 6 0 110 12A6 6 0 0112 6zm0 2a4 4 0 100 8 4 4 0 010-8z"/></svg>
              </div>
              <div class="nav-text">
                <span class="nav-label">RFID / NFC</span>
                <span class="nav-desc">Scan & read NFC tags</span>
              </div>
              <span class="nav-arrow">›</span>
            </a>

            <!-- Sync Logs -->
            <a class="nav-card ${bleClass}" href="${resolveRouterPath('sync')}">
              <div class="nav-icon" style="background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.25);">
                <svg viewBox="0 0 24 24" style="fill:var(--accent2);"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
              </div>
              <div class="nav-text">
                <span class="nav-label">Sync Logs</span>
                <span class="nav-desc">Download new logs from device</span>
              </div>
              <span class="nav-arrow">›</span>
            </a>

            <!-- Log Viewer -->
            <a class="nav-card" href="${resolveRouterPath('log')}">
              <div class="nav-icon" style="background:rgba(0,255,163,0.08);border:1px solid rgba(0,255,163,0.25);">
                <svg viewBox="0 0 24 24" style="fill:var(--ok);"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z"/></svg>
              </div>
              <div class="nav-text">
                <span class="nav-label">Log Viewer</span>
                <span class="nav-desc">View sensor data charts & download CSV</span>
              </div>
              <span class="nav-arrow">›</span>
            </a>

            <!-- History -->
            <a class="nav-card" href="${resolveRouterPath('history')}">
              <div class="nav-icon" style="background:rgba(255,107,53,0.08);border:1px solid rgba(255,107,53,0.25);">
                <svg viewBox="0 0 24 24" style="fill:var(--warn);"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0013 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
              </div>
              <div class="nav-text">
                <span class="nav-label">History</span>
                <span class="nav-desc">Browse & view uploaded log files</span>
              </div>
              <span class="nav-arrow">›</span>
            </a>

            <span class="group-label">Info</span>

            <!-- About -->
            <a class="nav-card" href="${resolveRouterPath('about')}">
              <div class="nav-icon" style="background:rgba(0,255,163,0.08);border:1px solid rgba(0,255,163,0.25);">
                <svg viewBox="0 0 24 24" style="fill:var(--ok);"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-6h2v6zm0-8h-2V7h2v4z"/></svg>
              </div>
              <div class="nav-text">
                <span class="nav-label">About</span>
                <span class="nav-desc">Project info & documentation</span>
              </div>
              <span class="nav-arrow">›</span>
            </a>

          </div>

          <div class="info-tile">
            <h3>DNAir AirSampler PWA</h3>
            <p>Progressive Web App for controlling the AirSampler device. Requires Chrome on Android for BLE and NFC features.</p>
          </div>
        </div>
      </main>
    `;
  }
}
