import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import { bleService } from '../ble-service';

type WriteStatus = 'idle' | 'running' | 'ok' | 'error';

@customElement('app-device-config')
export class AppDeviceConfig extends LitElement {

  @state() private deviceName = '';
  @state() private connected  = bleService.connStatus === 'connected';

  @state() private nfcStatus: WriteStatus = 'idle';
  @state() private nfcMsg = '';

  @state() private bleStatus: WriteStatus = 'idle';
  @state() private bleMsg = '';

  private _onStatus = () => { this.connected = bleService.connStatus === 'connected'; };

  connectedCallback() {
    super.connectedCallback();
    bleService.addEventListener('status-changed', this._onStatus);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    bleService.removeEventListener('status-changed', this._onStatus);
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  private _generate() {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    const hex   = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    this.deviceName = `AirSampler-${hex}`;
    this.nfcStatus  = 'idle';
    this.bleStatus  = 'idle';
  }

  private async _writeToRfid() {
    const name = this.deviceName.trim();
    if (!name) return;
    if (!('NDEFReader' in window)) {
      this.nfcStatus = 'error';
      this.nfcMsg    = 'NFC not available on this device';
      return;
    }
    try {
      this.nfcStatus = 'running';
      this.nfcMsg    = '';
      const writer = new (window as any).NDEFReader();
      await writer.write({ records: [{ recordType: 'text', data: name }] });
      this.nfcStatus = 'ok';
      this.nfcMsg    = 'Written to tag';
    } catch (e: any) {
      this.nfcStatus = 'error';
      this.nfcMsg    = e?.message ?? 'Write failed';
    }
  }

  private async _writeToDevice() {
    const name = this.deviceName.trim();
    if (!name || !this.connected) return;
    this.bleStatus = 'running';
    this.bleMsg    = '';
    const lines = await bleService.sendCmd(`setBLEName -name ${name}`);
    if (lines.some(l => l.startsWith('OK'))) {
      this.bleStatus = 'ok';
      this.bleMsg    = 'Name updated — reconnect to apply';
    } else {
      this.bleStatus = 'error';
      this.bleMsg    = lines.find(l => l.startsWith('ERROR')) ?? 'Unknown error';
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────

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
      max-width: 520px;
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
      max-width: 520px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    /* ── Connect banner ── */
    .connect-banner {
      display: flex; align-items: center; gap: 14px; padding: 14px 16px;
      border: 1px solid rgba(59,130,246,0.3); border-radius: 12px;
      background: rgba(59,130,246,0.06); color: #93c5fd;
      text-decoration: none; transition: border-color 0.15s, background 0.15s;
    }
    .connect-banner:hover { border-color: rgba(59,130,246,0.5); background: rgba(59,130,246,0.1); }
    .connect-banner .cb-icon {
      width: 40px; height: 40px; border-radius: 10px;
      background: rgba(59,130,246,0.1);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .connect-banner .cb-label { flex: 1; font-size: 0.9375rem; font-weight: 600; letter-spacing: -0.01em; }
    .connect-banner .cb-arrow { color: rgba(147,197,253,0.5); font-size: 1.1rem; }

    /* ── Card ── */
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
      margin-bottom: 16px;
    }

    /* ── Name row ── */
    .name-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .input {
      font-family: var(--mono);
      font-size: 0.8125rem;
      padding: 7px 10px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: #18181b;
      color: var(--fg);
      outline: none;
      transition: border-color 0.15s;
      flex: 1;
      min-width: 0;
    }

    .input:focus { border-color: #52525b; }
    .input::placeholder { color: #3f3f46; }

    /* ── Buttons ── */
    .btn {
      font-family: var(--sans);
      font-size: 0.8125rem;
      font-weight: 500;
      padding: 7px 16px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--fg);
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .btn:hover:not(:disabled) { border-color: #72727a; background: #18181b; }
    .btn:disabled { opacity: 0.3; cursor: not-allowed; }

    .btn-generate {
      border-color: #3d3d50;
      color: #a5b4fc;
      background: rgba(99,102,241,0.06);
    }
    .btn-generate:hover:not(:disabled) { background: rgba(99,102,241,0.12); border-color: #6366f1; }

    /* ── Action rows ── */
    .action-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #27272a;
    }

    .action-label {
      font-size: 0.72rem;
      font-weight: 500;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted-fg);
      width: 100%;
      margin-bottom: 2px;
    }

    /* ── Badges ── */
    .badge {
      font-family: var(--mono);
      font-size: 0.68rem;
      padding: 3px 8px;
      border-radius: 4px;
      flex-shrink: 0;
    }

    .badge.ok      { color: #22c55e; background: rgba(34,197,94,0.08); }
    .badge.error   { color: #f87171; background: rgba(239,68,68,0.08); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .badge.running { color: #a1a1aa; animation: blink 0.7s infinite; }

    @keyframes blink { 50% { opacity: 0.3; } }

    /* ── Hint ── */
    .hint {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: #52525b;
      margin-top: 4px;
    }
  `;

  // ── Render ────────────────────────────────────────────────────────────────

  private _badge(status: WriteStatus, msg: string) {
    if (status === 'idle')    return '';
    if (status === 'running') return html`<span class="badge running">…</span>`;
    if (status === 'ok')      return html`<span class="badge ok">${msg}</span>`;
    return html`<span class="badge error">${msg}</span>`;
  }

  render() {
    const noName = !this.deviceName.trim();

    return html`
      <main>
        <div class="page-header">
          <a class="back-btn" href="${resolveRouterPath('admin')}">←</a>
          <span class="page-title">Device Configuration</span>
        </div>

        <div class="content">

          ${!this.connected ? html`
            <a class="connect-banner" href="${resolveRouterPath('connect')}">
              <div class="cb-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#93c5fd">
                  <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3a4.237 4.237 0 00-6 0zm-4-4l2 2a7.074 7.074 0 0110 0l2-2C15.14 9.14 8.87 9.14 5 13z"/>
                </svg>
              </div>
              <span class="cb-label">Connect to device to write name to it</span>
              <span class="cb-arrow">›</span>
            </a>
          ` : ''}

          <div class="card">
            <div class="card-title">Device Name</div>

            <div class="name-row">
              <input
                class="input"
                type="text"
                placeholder="e.g. AirSampler-A3F2B1C0"
                .value=${this.deviceName}
                @input=${(e: Event) => {
                  this.deviceName = (e.target as HTMLInputElement).value;
                  this.nfcStatus  = 'idle';
                  this.bleStatus  = 'idle';
                }}
              />
              <button class="btn btn-generate" @click=${this._generate}>Generate</button>
            </div>

            <!-- Write to RFID tag -->
            <div class="action-row">
              <span class="action-label">Write to RFID tag</span>
              <button class="btn"
                ?disabled=${noName || this.nfcStatus === 'running'}
                @click=${this._writeToRfid}>
                ${this.nfcStatus === 'running' ? 'Hold tag…' : 'Write to Tag'}
              </button>
              ${this._badge(this.nfcStatus, this.nfcMsg)}
              ${this.nfcStatus === 'running' ? html`
                <span class="hint">Hold an NFC tag close to the device</span>
              ` : ''}
            </div>

            <!-- Write to BLE device -->
            <div class="action-row">
              <span class="action-label">Write to device via BLE</span>
              <button class="btn"
                ?disabled=${noName || !this.connected || this.bleStatus === 'running'}
                @click=${this._writeToDevice}>
                ${this.bleStatus === 'running' ? 'Sending…' : 'Write to Device'}
              </button>
              ${this._badge(this.bleStatus, this.bleMsg)}
            </div>

          </div>

        </div>
      </main>
    `;
  }
}
