import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../../router';

@customElement('app-about')
export class AppAbout extends LitElement {

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
      max-width: 560px;
      padding: 24px 20px 0;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .back-btn {
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: transparent;
      color: var(--muted-fg);
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
      text-decoration: none;
      font-size: 1rem;
    }

    .back-btn:hover { color: var(--fg); border-color: #52525b; }

    .page-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--fg);
    }

    .content {
      width: 100%;
      max-width: 560px;
      padding: 24px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    /* Hero */
    .hero {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 16px;
      padding: 4px 0 8px;
    }

    .hero-text {
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex: 1;
      min-width: 0;
    }

    .device-img {
      width: 140px;
      height: 180px;
      flex-shrink: 0;
      border-radius: 10px;
      border: 1px solid var(--border);
      object-fit: contain;
      background: #0d0d0f;
      display: block;
    }

    .hero-title {
      font-size: 1.375rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: var(--fg);
    }

    .hero-sub {
      font-size: 0.875rem;
      color: var(--muted-fg);
      line-height: 1.6;
    }

    /* Cards */
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px 18px;
    }

    .card-title {
      font-size: 0.75rem;
      font-weight: 500;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--muted-fg);
      margin-bottom: 12px;
    }

    /* Feature list */
    .feature-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .feature {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }

    .feature-icon {
      width: 32px; height: 32px;
      border-radius: 7px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      margin-top: 1px;
    }

    .feature-icon svg { width: 16px; height: 16px; }

    .feature-body {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .feature-name {
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--fg);
    }

    .feature-desc {
      font-size: 0.75rem;
      color: var(--muted-fg);
      line-height: 1.5;
    }

    /* Info rows */
    .info-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 9px 0;
      border-bottom: 1px solid var(--border);
      font-size: 0.8125rem;
    }

    .info-row:last-child { border-bottom: none; }

    .info-key { color: var(--muted-fg); }
    .info-val { color: var(--fg); font-family: var(--mono); font-size: 0.75rem; }

    .badge {
      font-size: 0.6875rem;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: 10px;
      letter-spacing: 0.02em;
    }

    .badge-blue  { background: rgba(59,130,246,0.12); border: 1px solid rgba(59,130,246,0.3); color: #60a5fa; }
    .badge-green { background: rgba(34,197,94,0.08);  border: 1px solid rgba(34,197,94,0.3);  color: #22c55e; }

    /* Authors */
    .author {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
    }

    .author:last-child { border-bottom: none; }

    .author-body {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .author-name {
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--fg);
    }

    .author-role {
      font-size: 0.75rem;
      color: var(--muted-fg);
    }

    .author-link {
      font-size: 0.72rem;
      font-family: var(--mono);
      color: var(--muted-fg);
      text-decoration: none;
      border: 1px solid var(--border);
      padding: 3px 10px;
      border-radius: 5px;
      transition: color 0.15s, border-color 0.15s;
      flex-shrink: 0;
    }

    .author-link:hover { color: var(--fg); border-color: #52525b; }
  `;

  render() {
    return html`
      <main>
        <div class="page-header">
          <a class="back-btn" href="${resolveRouterPath()}">←</a>
          <span class="page-title">About</span>
        </div>

        <div class="content">

          <div class="hero">
            <div class="hero-text">
              <span class="hero-title">AirSampler</span>
              <span class="hero-sub">
                Progressive web app for controlling and monitoring the DNAir AirSampler device —
                an ESP32-based environmental DNA air sampling system.
              </span>
            </div>
            <img class="device-img" src="/pwa-airsampler/assets/device/DeviceV8_2.jpg" alt="AirSampler device" />
          </div>

          <!-- Features -->
          <div class="card">
            <div class="card-title">Features</div>
            <div class="feature-list">

              <div class="feature">
                <div class="feature-icon" style="background:rgba(59,130,246,0.1);">
                  <svg viewBox="0 0 24 24" fill="#60a5fa"><path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/></svg>
                </div>
                <div class="feature-body">
                  <span class="feature-name">Bluetooth Low Energy</span>
                  <span class="feature-desc">Wireless connection to the device for real-time control and data streaming.</span>
                </div>
              </div>

              <div class="feature">
                <div class="feature-icon" style="background:rgba(34,197,94,0.08);">
                  <svg viewBox="0 0 24 24" fill="#22c55e"><path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm-1 14V8l6 4-6 4z"/></svg>
                </div>
                <div class="feature-body">
                  <span class="feature-name">Sampling Control</span>
                  <span class="feature-desc">Configure and start air sampling runs with custom duration, flow rate, and RFID tag assignment.</span>
                </div>
              </div>

              <div class="feature">
                <div class="feature-icon" style="background:rgba(245,158,11,0.08);">
                  <svg viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
                </div>
                <div class="feature-body">
                  <span class="feature-name">Log Sync</span>
                  <span class="feature-desc">Download sampling runs from device memory and upload them to Firebase cloud storage.</span>
                </div>
              </div>

              <div class="feature">
                <div class="feature-icon" style="background:rgba(168,85,247,0.08);">
                  <svg viewBox="0 0 24 24" fill="#a855f7"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M6 15h2v-2H6v2zm0-4h2V9H6v2zm0-4h2V5H6v2zm4 8h2v-2h-2v2zm0-4h2V9h-2v2zm0-4h2V5h-2v2zm4 8h2v-2h-2v2zm0-4h2V9h-2v2zm0-4h2V5h-2v2z"/></svg>
                </div>
                <div class="feature-body">
                  <span class="feature-name">Sample Lookup</span>
                  <span class="feature-desc">Scan an RFID tag with NFC to instantly find and view the associated sampling run in the cloud.</span>
                </div>
              </div>

              <div class="feature">
                <div class="feature-icon" style="background:rgba(255,255,255,0.05);">
                  <svg viewBox="0 0 24 24" fill="#a1a1aa"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14v-4H7l5-5 5 5h-4v4h-2z"/></svg>
                </div>
                <div class="feature-body">
                  <span class="feature-name">Offline-first PWA</span>
                  <span class="feature-desc">Installable on Android. Works without an internet connection — syncs to cloud when online.</span>
                </div>
              </div>

            </div>
          </div>

          <!-- Authors -->
          <div class="card">
            <div class="card-title">Authors</div>
            <div class="author">
              <div class="author-body">
                <span class="author-name">Tobias Mäder</span>
                <span class="author-role">Software Engineering</span>
              </div>
            </div>
            <div class="author">
              <div class="author-body">
                <span class="author-name">Nathaniel Walser</span>
                <span class="author-role">Hardware Engineering, Process Engineering</span>
              </div>
              <a class="author-link" href="https://www.linkedin.com/in/nathaniel-walser/" target="_blank" rel="noopener">LinkedIn</a>
            </div>
          </div>

          <!-- Technical info -->
          <div class="card">
            <div class="card-title">Technical</div>
            <div class="info-row">
              <span class="info-key">Version</span>
              <span class="info-val">v${__APP_VERSION__}</span>
            </div>
            <div class="info-row">
              <span class="info-key">Platform</span>
              <span class="badge badge-blue">ESP32 + BLE</span>
            </div>
            <div class="info-row">
              <span class="info-key">Frontend</span>
              <span class="info-val">Lit 3 · TypeScript · Vite</span>
            </div>
            <div class="info-row">
              <span class="info-key">Cloud</span>
              <span class="info-val">Firebase Firestore</span>
            </div>
            <div class="info-row">
              <span class="info-key">NFC</span>
              <span class="info-val">Web NFC API (Android Chrome)</span>
            </div>
            <div class="info-row">
              <span class="info-key">Status</span>
              <span class="badge badge-green">Active development</span>
            </div>
          </div>

        </div>
      </main>
    `;
  }
}
