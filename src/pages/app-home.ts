import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';

@customElement('app-home')
export class AppHome extends LitElement {

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
      transition: border-color 0.25s, transform 0.15s, box-shadow 0.25s;
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

    .nav-icon {
      width: 48px; height: 48px;
      border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }

    .nav-icon svg { width: 26px; height: 26px; }

    .nav-icon.ble {
      background: rgba(124,58,237,0.12);
      border: 1px solid rgba(124,58,237,0.3);
    }
    .nav-icon.ble svg { fill: var(--accent2); }

    .nav-icon.rfid {
      background: rgba(0,229,255,0.08);
      border: 1px solid rgba(0,229,255,0.25);
    }
    .nav-icon.rfid svg { fill: var(--accent); }

    .nav-icon.about {
      background: rgba(0,255,163,0.08);
      border: 1px solid rgba(0,255,163,0.25);
    }
    .nav-icon.about svg { fill: var(--ok); }

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
    }

    .nav-card:hover .nav-arrow {
      color: var(--accent);
      transform: translateX(3px);
    }

    /* Info footer */
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
            <!-- BLE -->
            <a class="nav-card" href="${resolveRouterPath('ble')}">
              <div class="nav-icon ble">
                <svg viewBox="0 0 24 24"><path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/></svg>
              </div>
              <div class="nav-text">
                <span class="nav-label">BLE Control</span>
                <span class="nav-desc">Connect & control AirSampler via Bluetooth</span>
              </div>
              <span class="nav-arrow">›</span>
            </a>

            <!-- RFID -->
            <a class="nav-card" href="${resolveRouterPath('rfid')}">
              <div class="nav-icon rfid">
                <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4a6 6 0 110 12A6 6 0 0112 6zm0 2a4 4 0 100 8 4 4 0 010-8z"/></svg>
              </div>
              <div class="nav-text">
                <span class="nav-label">RFID / NFC</span>
                <span class="nav-desc">Scan & read NFC tags via Web NFC API</span>
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

            <!-- Device -->
            <a class="nav-card" href="${resolveRouterPath('device')}">
              <div class="nav-icon" style="background:rgba(0,255,163,0.08);border:1px solid rgba(0,255,163,0.25);">
                <svg viewBox="0 0 24 24" style="fill:var(--ok);"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6 2.69-6 6-6zm0 2c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 2a2 2 0 110 4 2 2 0 010-4z"/></svg>
              </div>
              <div class="nav-text">
                <span class="nav-label">Device</span>
                <span class="nav-desc">Status LEDs, battery, sampling & new sample</span>
              </div>
              <span class="nav-arrow">›</span>
            </a>

            <!-- About -->
            <a class="nav-card" href="${resolveRouterPath('about')}">
              <div class="nav-icon about">
                <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-6h2v6zm0-8h-2V7h2v4z"/></svg>
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
