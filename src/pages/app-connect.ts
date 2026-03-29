import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import { bleService, ConnStatus } from '../ble-service';

type NfcScanStatus = 'unavailable' | 'scanning' | 'found';

@customElement('app-connect')
export class AppConnect extends LitElement {

  @state() private connStatus: ConnStatus = bleService.connStatus;
  @state() private nfcStatus: NfcScanStatus | null = null;
  @state() private scannedName = '';

  private _nfcAbort: AbortController | null = null;

  private _onStatus = () => {
    this.connStatus = bleService.connStatus;
    if (bleService.connStatus === 'connected') {
      window.location.href = resolveRouterPath();
    }
  };

  connectedCallback() {
    super.connectedCallback();
    bleService.addEventListener('status-changed', this._onStatus);
    this._startNfcScan();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    bleService.removeEventListener('status-changed', this._onStatus);
    this._nfcAbort?.abort();
  }

  private async _startNfcScan() {
    if (!('NDEFReader' in window)) { this.nfcStatus = 'unavailable'; return; }
    try {
      this._nfcAbort = new AbortController();
      const reader = new (window as any).NDEFReader();
      this.nfcStatus = 'scanning';
      reader.onreading = async (e: any) => {
        let name = '';
        for (const record of e.message?.records ?? []) {
          if (record.recordType === 'text') {
            name = new TextDecoder().decode(record.data).trim();
            break;
          }
        }
        if (!name) name = (e.serialNumber ?? '').toUpperCase();
        if (!name) return;

        this._nfcAbort?.abort();
        this.scannedName = name;
        this.nfcStatus   = 'found';

        // Try silent connect to a previously-paired device first.
        // If not known, open the BLE picker immediately (NFC read counts as user gesture).
        const ok = await bleService.connectByName(name);
        if (!ok) {
          bleService.connect(name);
        }
      };
      await reader.scan({ signal: this._nfcAbort.signal });
    } catch {
      this.nfcStatus = 'unavailable';
    }
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
      max-width: 400px;
      padding: 48px 20px 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
    }

    .ble-visual {
      position: relative;
      width: 120px; height: 120px;
      display: flex; align-items: center; justify-content: center;
    }

    .ring {
      position: absolute;
      border-radius: 50%;
      border: 1px solid #27272a;
      opacity: 0;
    }

    .ring:nth-child(1) { width: 64px;  height: 64px;  }
    .ring:nth-child(2) { width: 90px;  height: 90px;  }
    .ring:nth-child(3) { width: 116px; height: 116px; }

    .ble-visual.scanning .ring { animation: ripple 2s ease-out infinite; border-color: #a1a1aa; }
    .ble-visual.scanning .ring:nth-child(2) { animation-delay: 0.5s; }
    .ble-visual.scanning .ring:nth-child(3) { animation-delay: 1s; }

    @keyframes ripple {
      0%   { opacity: 0.5; transform: scale(0.85); }
      100% { opacity: 0;   transform: scale(1.05); }
    }

    .ble-icon-wrap {
      width: 52px; height: 52px;
      border: 1px solid var(--border);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: #18181b;
      z-index: 1;
      transition: border-color 0.3s;
    }

    .ble-icon-wrap svg { width: 24px; height: 24px; fill: #a1a1aa; }

    .status-text {
      font-family: var(--mono);
      font-size: 0.8rem;
      letter-spacing: 0.06em;
      color: var(--muted-fg);
      text-align: center;
    }

    .status-text.connecting { color: #f59e0b; }
    .status-text.failed     { color: #ef4444; }

    .btn-connect {
      font-family: var(--sans);
      font-size: 0.875rem;
      font-weight: 500;
      letter-spacing: -0.01em;
      padding: 10px 32px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      background: var(--fg);
      color: #09090b;
      transition: opacity 0.15s;
    }

    .btn-connect:hover:not(:disabled)  { opacity: 0.88; }
    .btn-connect:disabled { opacity: 0.35; cursor: not-allowed; }

    /* ── NFC widget ── */
    .nfc-widget {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
    }

    .nfc-ring {
      width: 88px; height: 88px;
      border-radius: 50%;
      border: 2px solid #3f3f46;
      background: #111113;
      display: flex; align-items: center; justify-content: center;
      transition: border-color 0.3s;
    }

    .nfc-ring.scanning {
      border-color: #3b82f6;
      animation: nfc-pulse 1.5s ease-in-out infinite;
    }

    .nfc-ring.found {
      border-color: #22c55e;
    }

    @keyframes nfc-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.45); }
      50%       { box-shadow: 0 0 0 18px rgba(59,130,246,0); }
    }

    .nfc-label {
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--muted-fg);
      text-align: center;
    }

    .nfc-label.scanning { color: #60a5fa; }
    .nfc-label.found    { color: #22c55e; }

    .compat-box {
      width: 100%;
      padding: 12px 14px;
      border: 1px solid #3f2a1a;
      border-radius: 8px;
      background: rgba(245,158,11,0.06);
      font-size: 0.78rem;
      line-height: 1.6;
      color: #fbbf24;
      font-family: var(--mono);
    }
  `;

  render() {
    const connecting   = this.connStatus === 'connecting';
    const bleSupported = !!navigator.bluetooth;

    return html`
      <main>
        <div class="page-header">
          <a class="back-btn" href="${resolveRouterPath()}">←</a>
          <span class="page-title">Connect</span>
        </div>

        <div class="content">

          ${!bleSupported ? html`
            <div class="compat-box">
              Web Bluetooth is not available. Use Chrome on Android or enable
              chrome://flags/#enable-web-bluetooth on desktop.
            </div>
          ` : ''}

          ${this.nfcStatus === 'scanning' || this.nfcStatus === 'found' ? html`
            <div class="nfc-widget">
              <div class="nfc-ring ${this.nfcStatus}">
                <svg width="40" height="40" viewBox="0 0 24 24"
                  fill="${this.nfcStatus === 'found' ? '#22c55e' : '#60a5fa'}">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
                  <path d="M6 15h2v-2H6v2zm0-4h2V9H6v2zm0-4h2V5H6v2zm4 8h2v-2h-2v2zm0-4h2V9h-2v2zm0-4h2V5h-2v2zm4 8h2v-2h-2v2zm0-4h2V9h-2v2zm0-4h2V5h-2v2z"/>
                </svg>
              </div>
              <span class="nfc-label ${this.nfcStatus}">
                ${this.nfcStatus === 'found'
                  ? `Tag found: ${this.scannedName} — connecting…`
                  : 'Hold RFID tag near phone…'}
              </span>
            </div>
          ` : ''}

          <div class="ble-visual ${connecting ? 'scanning' : ''}">
            <div class="ring"></div>
            <div class="ring"></div>
            <div class="ring"></div>
            <div class="ble-icon-wrap">
              <svg viewBox="0 0 24 24"><path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/></svg>
            </div>
          </div>

          <p class="status-text ${connecting ? 'connecting' : this.connStatus === 'failed' ? 'failed' : ''}">
            ${connecting                   ? 'Connecting to device…'
            : this.connStatus === 'failed' ? 'Connection failed — try again'
            : this.nfcStatus === null      ? 'Hold an RFID tag to connect, or tap below'
            : ''}
          </p>

          <button class="btn-connect"
            ?disabled=${!bleSupported || connecting}
            @click=${() => bleService.connect(this.scannedName || undefined)}>
            ${connecting ? 'Connecting…' : this.scannedName ? `Connect to ${this.scannedName}` : 'Connect'}
          </button>

        </div>
      </main>
    `;
  }
}
