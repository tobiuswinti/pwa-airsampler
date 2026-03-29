import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import { bleService } from '../ble-service';

type WriteStatus = 'idle' | 'nfc' | 'nfc-done' | 'ble' | 'ok' | 'error';

@customElement('app-device-config')
export class AppDeviceConfig extends LitElement {

  @state() private deviceName = '';
  @state() private connected  = bleService.connStatus === 'connected';

  @state() private status: WriteStatus = 'idle';
  @state() private msg = '';

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
    this.status = 'idle';
    this.msg    = '';
  }

  private async _write() {
    const name = this.deviceName.trim();
    if (!name) return;

    if (!('NDEFReader' in window)) {
      this.status = 'error';
      this.msg    = 'NFC not available on this device';
      return;
    }

    // Step 1: write to RFID tag
    this.status = 'nfc';
    this.msg    = '';
    try {
      const writer = new (window as any).NDEFReader();
      await writer.write({ records: [{ recordType: 'text', data: name }] });
      this.status = 'nfc-done';
    } catch (e: any) {
      this.status = 'error';
      this.msg    = e?.message ?? 'NFC write failed';
      return;
    }

    // Step 2: write to BLE device automatically
    if (this.connected) {
      this.status = 'ble';
      const lines = await bleService.sendCmd(`setBLEName -name ${name}`);
      if (lines.some(l => l.startsWith('OK'))) {
        this.status = 'ok';
        this.msg    = 'Name updated — reconnect to apply';
      } else {
        this.status = 'error';
        this.msg    = lines.find(l => l.startsWith('ERROR')) ?? 'Unknown error';
      }
    } else {
      this.status = 'ok';
      this.msg    = 'Written to tag — connect device to update BLE name';
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

    /* ── Write section ── */
    .write-section {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #27272a;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }

    /* ── NFC ring ── */
    .nfc-widget {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
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

    .nfc-ring.done { border-color: #22c55e; }
    .nfc-ring.error { border-color: #ef4444; }

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
    .nfc-label.done     { color: #22c55e; }
    .nfc-label.error    { color: #f87171; }

    /* ── Step list ── */
    .steps {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .step {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.78rem;
      font-family: var(--mono);
      color: var(--muted-fg);
    }

    .step-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #3f3f46;
      flex-shrink: 0;
    }

    .step.active   .step-dot { background: #60a5fa; }
    .step.done     .step-dot { background: #22c55e; }
    .step.error    .step-dot { background: #f87171; }
    .step.active              { color: #93c5fd; }
    .step.done                { color: #4ade80; }
    .step.error               { color: #f87171; }

    /* ── Badges ── */
    .badge {
      font-family: var(--mono);
      font-size: 0.68rem;
      padding: 3px 8px;
      border-radius: 4px;
      flex-shrink: 0;
    }

    .badge.ok      { color: #22c55e; background: rgba(34,197,94,0.08); }
    .badge.error   { color: #f87171; background: rgba(239,68,68,0.08); }
    .badge.running { color: #a1a1aa; animation: blink 0.7s infinite; }

    @keyframes blink { 50% { opacity: 0.3; } }
  `;

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    const noName  = !this.deviceName.trim();
    const busy    = this.status === 'nfc' || this.status === 'nfc-done' || this.status === 'ble';

    const nfcRingClass = this.status === 'nfc'      ? 'scanning'
                       : this.status === 'nfc-done' || this.status === 'ble' || this.status === 'ok' ? 'done'
                       : this.status === 'error'    ? 'error'
                       : '';

    const nfcIconColor = nfcRingClass === 'done'     ? '#22c55e'
                       : nfcRingClass === 'error'    ? '#f87171'
                       : nfcRingClass === 'scanning' ? '#60a5fa'
                       : '#52525b';

    const nfcLabelClass = nfcRingClass;
    const nfcLabelText  = this.status === 'nfc'      ? 'Hold RFID tag to phone…'
                        : this.status === 'nfc-done' ? 'Tag written'
                        : this.status === 'ble'      ? 'Sending to device…'
                        : this.status === 'ok'       ? 'Done'
                        : this.status === 'error'    ? this.msg
                        : 'Hold RFID tag to phone when ready';

    const nfcStep1Class = this.status === 'nfc'                    ? 'active'
                        : ['nfc-done','ble','ok'].includes(this.status) ? 'done'
                        : this.status === 'error' && !['ble','ok'].includes(this.status) ? 'error'
                        : '';
    const nfcStep2Class = this.status === 'ble'    ? 'active'
                        : this.status === 'ok'     ? 'done'
                        : this.status === 'error' && (this.status as string) === 'error' ? ''
                        : '';

    const showWidget = this.status !== 'idle';

    return html`
      <main>
        <div class="page-header">
          <a class="back-btn" href="${resolveRouterPath()}">←</a>
          <span class="page-title">Set Device Name</span>
        </div>

        <div class="content">

          ${!this.connected ? html`
            <a class="connect-banner" href="${resolveRouterPath('connect')}">
              <div class="cb-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#93c5fd">
                  <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3a4.237 4.237 0 00-6 0zm-4-4l2 2a7.074 7.074 0 0110 0l2-2C15.14 9.14 8.87 9.14 5 13z"/>
                </svg>
              </div>
              <span class="cb-label">Connect to device to also update BLE name</span>
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
                  this.status = 'idle';
                  this.msg    = '';
                }}
              />
              <button class="btn btn-generate" @click=${this._generate}>Generate</button>
            </div>

            <div class="write-section">

              ${showWidget ? html`
                <div class="nfc-widget">
                  <div class="nfc-ring ${nfcRingClass}">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="${nfcIconColor}">
                      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
                      <path d="M6 15h2v-2H6v2zm0-4h2V9H6v2zm0-4h2V5H6v2zm4 8h2v-2h-2v2zm0-4h2V9h-2v2zm0-4h2V5h-2v2zm4 8h2v-2h-2v2zm0-4h2V9h-2v2zm0-4h2V5h-2v2z"/>
                    </svg>
                  </div>
                  <span class="nfc-label ${nfcLabelClass}">${nfcLabelText}</span>
                </div>

                <div class="steps">
                  <div class="step ${nfcStep1Class}">
                    <div class="step-dot"></div>
                    Write name to RFID tag
                  </div>
                  <div class="step ${nfcStep2Class}">
                    <div class="step-dot"></div>
                    Send BLE name to device
                    ${!this.connected ? html` <span style="color:#52525b">(skipped — not connected)</span>` : ''}
                  </div>
                </div>
              ` : ''}

              <button class="btn"
                ?disabled=${noName || busy}
                @click=${this._write}>
                ${this.status === 'nfc'  ? 'Hold tag to phone…'
                : this.status === 'ble'  ? 'Sending to device…'
                : this.status === 'ok'   ? 'Write Again'
                : 'Write'}
              </button>

            </div>
          </div>

        </div>
      </main>
    `;
  }
}
