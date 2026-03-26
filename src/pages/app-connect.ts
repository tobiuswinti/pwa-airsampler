import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import { bleService, ConnStatus } from '../ble-service';

@customElement('app-connect')
export class AppConnect extends LitElement {

  @state() private connStatus: ConnStatus = bleService.connStatus;

  private _onStatus = () => {
    this.connStatus = bleService.connStatus;
    if (bleService.connStatus === 'connected') {
      window.location.href = resolveRouterPath();
    }
  };

  connectedCallback() {
    super.connectedCallback();
    bleService.addEventListener('status-changed', this._onStatus);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    bleService.removeEventListener('status-changed', this._onStatus);
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
      border: 2px solid var(--accent2);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 12px rgba(124,58,237,0.4);
      flex-shrink: 0;
    }

    .logo-icon svg { width: 18px; height: 18px; fill: var(--accent2); }

    .page-title {
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--accent2);
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

    .connect-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 36px 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
      position: relative;
      overflow: hidden;
    }

    .connect-card::after {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--accent2), transparent);
    }

    .pulse-wrap {
      position: relative;
      width: 140px; height: 140px;
      display: flex; align-items: center; justify-content: center;
    }

    .ring {
      position: absolute;
      border-radius: 50%;
      border: 1.5px solid var(--accent2);
      opacity: 0;
    }

    .ring:nth-child(1) { width: 64px;  height: 64px; }
    .ring:nth-child(2) { width: 96px;  height: 96px; }
    .ring:nth-child(3) { width: 128px; height: 128px; }

    .pulse-wrap.active .ring              { animation: ripple 2s ease-out infinite; }
    .pulse-wrap.active .ring:nth-child(2) { animation-delay: 0.5s; }
    .pulse-wrap.active .ring:nth-child(3) { animation-delay: 1s; }

    @keyframes ripple {
      0%   { transform: scale(0.7); opacity: 0.7; }
      100% { transform: scale(1.1); opacity: 0; }
    }

    .ble-icon {
      width: 56px; height: 56px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      z-index: 1;
      transition: all 0.3s;
      border: 2px solid var(--accent2);
      background: rgba(124,58,237,0.1);
    }

    .ble-icon svg { width: 28px; height: 28px; fill: var(--accent2); }

    .status-text {
      font-family: var(--mono);
      font-size: 0.82rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      text-align: center;
    }

    .status-text.disconnected { color: var(--muted); }
    .status-text.connecting   { color: orange; }
    .status-text.connected    { color: var(--ok); }
    .status-text.failed       { color: var(--warn); }

    .btn-connect {
      font-family: var(--display);
      font-size: 0.9rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      padding: 14px 48px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      background: linear-gradient(135deg, var(--accent2), var(--accent));
      color: #fff;
      transition: opacity 0.2s, transform 0.15s;
      box-shadow: 0 0 20px rgba(124,58,237,0.25);
    }

    .btn-connect:hover    { opacity: 0.88; transform: translateY(-1px); }
    .btn-connect:active   { transform: translateY(0); }
    .btn-connect:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }

    .compat-box {
      background: rgba(255,107,53,0.06);
      border: 1px solid rgba(255,107,53,0.3);
      border-radius: 12px;
      padding: 14px 18px;
      font-size: 0.8rem;
      line-height: 1.65;
      color: #e2a98a;
      font-family: var(--mono);
    }

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
  `;

  render() {
    const connecting  = this.connStatus === 'connecting';
    const bleSupported = !!navigator.bluetooth;

    return html`
      <main>
        <div class="page-header">
          <div class="logo-icon">
            <svg viewBox="0 0 24 24"><path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/></svg>
          </div>
          <span class="page-title">Connect</span>
        </div>

        <div class="content">

          ${!bleSupported ? html`
            <div class="compat-box">
              Web Bluetooth is not available. Use Chrome on Android or enable the experimental flag in desktop Chrome (chrome://flags/#enable-web-bluetooth).
            </div>
          ` : ''}

          <div class="connect-card">
            <div class="pulse-wrap ${connecting ? 'active' : ''}">
              <div class="ring"></div>
              <div class="ring"></div>
              <div class="ring"></div>
              <div class="ble-icon">
                <svg viewBox="0 0 24 24"><path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/></svg>
              </div>
            </div>

            <div class="status-text ${this.connStatus}">
              ${this.connStatus === 'connecting' ? 'Connecting…'
              : this.connStatus === 'failed'     ? 'Connection failed — try again'
              : 'Not connected'}
            </div>

            <button class="btn-connect"
              ?disabled=${!bleSupported || connecting}
              @click=${() => bleService.connect()}>
              ${connecting ? 'Connecting…' : 'Connect'}
            </button>
          </div>

          <div><a class="nav-back" href="${resolveRouterPath()}">← Back to Home</a></div>

        </div>
      </main>
    `;
  }
}
