import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import { bleService } from '../ble-service';

type ActionState = 'idle' | 'running' | 'ok' | 'error';

interface ActionResult {
  state: ActionState;
  msg: string;
}

function idle(): ActionResult { return { state: 'idle', msg: '' }; }

@customElement('app-admin')
export class AppAdmin extends LitElement {

  @state() private connected = bleService.connStatus === 'connected';

  // ── Device Name ───────────────────────────────────────────────────────
  @state() private deviceSuffix = '';  // the part after "AirSampler-"
  @state() private writeStatus: 'idle' | 'nfc' | 'nfc-done' | 'ble' | 'ok' | 'error' = 'idle';
  @state() private writeMsg = '';

  // ── Servo zero ────────────────────────────────────────────────────────
  @state() private zeroResult      = idle();
  @state() private zeroSecondsLeft = 0;
  private _zeroTimer: number | null = null;

  // ── Logging ───────────────────────────────────────────────────────────
  @state() private logSink: 'serial' | 'file' | 'ble' = 'ble';
  @state() private logLevel: 'verbose' | 'debug' | 'info' | 'warn' | 'error' | 'none' = 'info';
  @state() private logLevelResult = idle();

  @state() private logsFrom       = '';
  @state() private getLogsResult  = idle();
  @state() private logsOutput: string[] = [];

  @state() private clearLogsConfirm      = false;
  @state() private clearLogsResult       = idle();

  @state() private clearStateConfirm     = false;
  @state() private clearStateResult      = idle();

  private _onStatus = () => { this.connected = bleService.connStatus === 'connected'; };

  connectedCallback() {
    super.connectedCallback();
    bleService.addEventListener('status-changed', this._onStatus);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    bleService.removeEventListener('status-changed', this._onStatus);
    if (this._zeroTimer !== null) clearInterval(this._zeroTimer);
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private _isOk(lines: string[]) { return lines.some(l => l.startsWith('OK')); }

  private _errMsg(lines: string[]): string {
    return lines.find(l => l.startsWith('ERROR')) ?? lines[0] ?? 'Unknown error';
  }

  private async _run(
    cmd: string,
    setResult: (r: ActionResult) => void,
  ): Promise<string[]> {
    setResult({ state: 'running', msg: '' });
    const lines = await bleService.sendCmd(cmd);
    if (this._isOk(lines)) {
      setResult({ state: 'ok', msg: 'Done' });
    } else {
      setResult({ state: 'error', msg: this._errMsg(lines) });
    }
    return lines;
  }

  // ── Device Name ───────────────────────────────────────────────────────

  private get _fullName() { return `AirSampler-${this.deviceSuffix}`; }

  private _generateName() {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    this.deviceSuffix = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    this.writeStatus  = 'idle';
    this.writeMsg     = '';
  }

  private async _writeName() {
    const name = this.deviceSuffix.trim() ? this._fullName : '';
    if (!name) return;

    if (!('NDEFReader' in window)) {
      this.writeStatus = 'error';
      this.writeMsg    = 'NFC not available on this device';
      return;
    }

    // Step 1: write to RFID tag
    this.writeStatus = 'nfc';
    this.writeMsg    = '';
    try {
      const writer = new (window as any).NDEFReader();
      await writer.write({ records: [{ recordType: 'text', data: name }] });
      this.writeStatus = 'nfc-done';
    } catch (e: any) {
      this.writeStatus = 'error';
      this.writeMsg    = e?.message ?? 'NFC write failed';
      return;
    }

    // Step 2: write to BLE device automatically
    if (this.connected) {
      this.writeStatus = 'ble';
      const lines = await bleService.sendCmd(`setBLEName -name ${name}`);
      if (lines.some(l => l.startsWith('OK'))) {
        this.writeStatus = 'ok';
        this.writeMsg    = 'Name updated — reconnect to apply';
      } else {
        this.writeStatus = 'error';
        this.writeMsg    = lines.find(l => l.startsWith('ERROR')) ?? 'Unknown error';
      }
    } else {
      this.writeStatus = 'ok';
      this.writeMsg    = 'Written to tag — connect device to update BLE name';
    }
  }

  // ── Servo zero ────────────────────────────────────────────────────────

  private async _servoZero() {
    if (this.zeroResult.state === 'running') return;
    this.zeroResult = { state: 'running', msg: '' };
    this.zeroSecondsLeft = 16;
    this._zeroTimer = window.setInterval(() => {
      this.zeroSecondsLeft = Math.max(0, this.zeroSecondsLeft - 1);
    }, 1000);
    const lines = await bleService.sendCmd('servoZero');
    if (this._zeroTimer !== null) { clearInterval(this._zeroTimer); this._zeroTimer = null; }
    this.zeroSecondsLeft = 0;
    if (lines.some(l => l.startsWith('OK'))) {
      this.zeroResult = { state: 'ok', msg: 'Calibration complete' };
    } else {
      this.zeroResult = { state: 'error', msg: lines.find(l => l.startsWith('ERROR')) ?? 'Unknown error' };
    }
  }

  // ── Log level ─────────────────────────────────────────────────────────

  private async _setLogLevel() {
    await this._run(
      `setLogLevel -sink ${this.logSink} -level ${this.logLevel}`,
      r => { this.logLevelResult = r; },
    );
  }

  // ── Get logs ─────────────────────────────────────────────────────────

  private async _getLogs() {
    this.getLogsResult = { state: 'running', msg: '' };
    this.logsOutput = [];
    const cmd = this.logsFrom.trim() ? `getLogs -from ${this.logsFrom}` : 'getLogs';
    const lines = await bleService.sendCmd(cmd);
    if (this._isOk(lines)) {
      this.logsOutput = lines.filter(l => !l.startsWith('OK') && !l.startsWith('ERROR'));
      this.getLogsResult = { state: 'ok', msg: `${this.logsOutput.length} entries` };
    } else {
      this.getLogsResult = { state: 'error', msg: this._errMsg(lines) };
    }
  }

  // ── Clear logs ────────────────────────────────────────────────────────

  private async _clearLogs() {
    this.clearLogsConfirm = false;
    await this._run('clearLogs', r => { this.clearLogsResult = r; });
  }

  // ── Clear state logs ──────────────────────────────────────────────────

  private async _clearStateLogs() {
    this.clearStateConfirm = false;
    await this._run('clearStateLogs', r => { this.clearStateResult = r; });
  }

  // ── Render helpers ────────────────────────────────────────────────────

  private _badge(state: ActionState, msg: string) {
    if (state === 'idle')    return '';
    if (state === 'running') return html`<span class="badge running">…</span>`;
    if (state === 'ok')      return html`<span class="badge ok">${msg || 'OK'}</span>`;
    return html`<span class="badge error">${msg}</span>`;
  }

  private _badgeR(r: ActionResult) {
    return this._badge(r.state, r.msg);
  }

  // ── Styles ────────────────────────────────────────────────────────────

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
      font-family: var(--sans); text-decoration: none;
      transition: border-color 0.15s, background 0.15s;
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
      margin-bottom: 4px;
    }

    /* ── Step instructions ── */
    .steps {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 16px;
    }

    .steps li {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 0.8125rem;
      color: var(--muted-fg);
      line-height: 1.5;
    }

    .step-num {
      flex-shrink: 0;
      width: 18px; height: 18px;
      border-radius: 50%;
      border: 1px solid #3f3f46;
      background: #18181b;
      color: #71717a;
      font-size: 0.65rem;
      font-weight: 600;
      display: flex; align-items: center; justify-content: center;
      margin-top: 1px;
    }

    /* ── Action rows ── */
    .action-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .action-row .btn { margin-left: auto; }
    .action-row .btn + .btn { margin-left: 0; }

    .action-row + .action-row {
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

    /* ── Inputs ── */
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
      min-width: 0;
    }

    .input:focus { border-color: #52525b; }
    .input:disabled { opacity: 0.35; }
    .input::placeholder { color: #3f3f46; }

    .input-sm { width: 90px; }
    .input-md { flex: 1; min-width: 80px; }

    select.input {
      cursor: pointer;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2358585f'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 10px center;
      padding-right: 28px;
    }

    .unit {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--muted-fg);
      flex-shrink: 0;
    }

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

    .btn-danger {
      border-color: #7f1d1d;
      color: #fca5a5;
      background: rgba(239,68,68,0.06);
    }

    .btn-danger:hover:not(:disabled) { background: rgba(239,68,68,0.12); border-color: #ef4444; }

    .btn-confirm {
      border-color: #ef4444;
      color: #f87171;
      background: rgba(239,68,68,0.10);
      animation: pulse-border 0.8s ease-in-out infinite;
    }

    @keyframes pulse-border {
      0%, 100% { border-color: #ef4444; }
      50%       { border-color: #7f1d1d; }
    }

    .segment-group {
      display: flex;
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
      flex-shrink: 0;
    }

    .segment {
      font-family: var(--mono);
      font-size: 0.75rem;
      padding: 7px 12px;
      background: transparent;
      border: none;
      color: var(--muted-fg);
      cursor: pointer;
      transition: background 0.12s, color 0.12s;
    }

    .segment + .segment { border-left: 1px solid var(--border); }
    .segment:hover:not(.active) { background: #18181b; }
    .segment.active { background: #27272a; color: var(--fg); }

    /* ── Badges ── */
    .badge {
      font-family: var(--mono);
      font-size: 0.68rem;
      padding: 3px 8px;
      border-radius: 4px;
      flex-shrink: 0;
    }

    .badge.ok      { color: #22c55e; background: rgba(34,197,94,0.08); }
    .badge.error   { color: #f87171; background: rgba(239,68,68,0.08); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .badge.running { color: #a1a1aa; animation: blink 0.7s infinite; }

    @keyframes blink { 50% { opacity: 0.3; } }

    .zero-progress {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: #a1a1aa;
    }

    .logs-output {
      margin-top: 10px;
      font-family: var(--mono);
      font-size: 0.65rem;
      color: var(--muted-fg);
      background: #09090b;
      border: 1px solid #27272a;
      border-radius: 5px;
      padding: 10px 12px;
      max-height: 200px;
      overflow-y: auto;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .confirm-note {
      font-family: var(--mono);
      font-size: 0.68rem;
      color: #f87171;
      flex-shrink: 0;
    }

    .hint {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: #52525b;
      width: 100%;
      margin-top: 2px;
    }

    .name-row {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 12px;
    }

    .name-prefix {
      font-family: var(--mono);
      font-size: 0.8125rem;
      color: var(--muted-fg);
      white-space: nowrap;
      flex-shrink: 0;
      user-select: none;
    }

    /* ── Write section ── */
    .write-section {
      margin-top: 4px;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 14px;
    }

    .write-section .nfc-widget { align-self: center; }
    .write-section .btn { align-self: flex-end; }

    .nfc-widget {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
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

    .nfc-ring.done  { border-color: #22c55e; }
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

    .write-steps {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .wstep {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.78rem;
      font-family: var(--mono);
      color: var(--muted-fg);
    }

    .wstep-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #3f3f46;
      flex-shrink: 0;
    }

    .wstep.active .wstep-dot { background: #60a5fa; }
    .wstep.done   .wstep-dot { background: #22c55e; }
    .wstep.error  .wstep-dot { background: #f87171; }
    .wstep.active             { color: #93c5fd; }
    .wstep.done               { color: #4ade80; }
    .wstep.error              { color: #f87171; }

    .wstep-skip { color: #52525b; margin-left: 4px; }
  `;

  // ── Render ────────────────────────────────────────────────────────────

  render() {
    const dis    = !this.connected;
    const noName = !this.deviceSuffix.trim();

    return html`
      <main>
        <div class="page-header">
          <a class="back-btn" href="${resolveRouterPath()}">←</a>
          <span class="page-title">Device Setup</span>
        </div>

        <div class="content">

          ${dis ? html`
            <a class="connect-banner" href="${resolveRouterPath('connect')}">
              <div class="cb-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#93c5fd">
                  <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3a4.237 4.237 0 00-6 0zm-4-4l2 2a7.074 7.074 0 0110 0l2-2C15.14 9.14 8.87 9.14 5 13z"/>
                </svg>
              </div>
              <span class="cb-label">Connect to device to use these controls</span>
              <span class="cb-arrow">›</span>
            </a>
          ` : ''}

          <!-- Set Device Name -->
          <div class="card">
            <div class="card-title">Set Device Name</div>
            <ol class="steps">
              <li>
                <span class="step-num">1</span>
                <span>Generate a unique name or type one manually in the field below.</span>
              </li>
              <li>
                <span class="step-num">2</span>
                <span>Tap <strong>Write to Tag + Device</strong>. Hold an NFC tag to the phone — the name is written to the tag, then sent to the device via BLE automatically.</span>
              </li>
            </ol>

            <div class="name-row">
              <span class="name-prefix">AirSampler-</span>
              <input
                class="input input-md"
                type="text"
                placeholder="e.g. A3F2B1C0"
                .value=${this.deviceSuffix}
                @input=${(e: Event) => {
                  this.deviceSuffix = (e.target as HTMLInputElement).value;
                  this.writeStatus  = 'idle';
                  this.writeMsg     = '';
                }}
              />
              <button class="btn btn-generate" @click=${this._generateName}>Generate</button>
            </div>

            <div class="write-section">
              ${this.writeStatus !== 'idle' ? html`
                <div class="nfc-widget">
                  <div class="nfc-ring ${
                    this.writeStatus === 'nfc'                                    ? 'scanning'
                    : ['nfc-done','ble','ok'].includes(this.writeStatus)          ? 'done'
                    : this.writeStatus === 'error'                                ? 'error'
                    : ''}">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="${
                      ['nfc-done','ble','ok'].includes(this.writeStatus) ? '#22c55e'
                      : this.writeStatus === 'error'                    ? '#f87171'
                      : '#60a5fa'}">
                      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
                      <path d="M6 15h2v-2H6v2zm0-4h2V9H6v2zm0-4h2V5H6v2zm4 8h2v-2h-2v2zm0-4h2V9h-2v2zm0-4h2V5h-2v2zm4 8h2v-2h-2v2zm0-4h2V9h-2v2zm0-4h2V5h-2v2z"/>
                    </svg>
                  </div>
                  <span class="nfc-label ${
                    this.writeStatus === 'nfc'                                    ? 'scanning'
                    : ['nfc-done','ble','ok'].includes(this.writeStatus)          ? 'done'
                    : this.writeStatus === 'error'                                ? 'error'
                    : ''}">
                    ${this.writeStatus === 'nfc'      ? 'Hold RFID tag to phone…'
                    : this.writeStatus === 'nfc-done' ? 'Tag written'
                    : this.writeStatus === 'ble'      ? 'Sending to device…'
                    : this.writeStatus === 'ok'       ? this.writeMsg
                    : this.writeMsg}
                  </span>
                </div>

                <div class="write-steps">
                  <div class="wstep ${
                    this.writeStatus === 'nfc'                             ? 'active'
                    : ['nfc-done','ble','ok'].includes(this.writeStatus)   ? 'done'
                    : this.writeStatus === 'error'                         ? 'error'
                    : ''}">
                    <div class="wstep-dot"></div>Write name to RFID tag
                  </div>
                  <div class="wstep ${
                    this.writeStatus === 'ble'  ? 'active'
                    : this.writeStatus === 'ok' ? 'done'
                    : ''}">
                    <div class="wstep-dot"></div>Send BLE name to device
                    ${!this.connected ? html`<span class="wstep-skip">(skipped — not connected)</span>` : ''}
                  </div>
                </div>
              ` : ''}

              <button class="btn"
                ?disabled=${noName || this.writeStatus === 'nfc' || this.writeStatus === 'nfc-done' || this.writeStatus === 'ble'}
                @click=${this._writeName}>
                ${this.writeStatus === 'nfc'      ? 'Hold tag to phone…'
                : this.writeStatus === 'ble'      ? 'Sending to device…'
                : this.writeStatus === 'ok'       ? 'Write Again'
                : 'Write to Tag + Device'}
              </button>
            </div>
          </div>

          <!-- Servo Calibration -->
          <div class="card">
            <div class="card-title">Servo Calibration</div>
            <ol class="steps">
              <li>
                <span class="step-num">1</span>
                <span>Make sure the servo arm is in the <strong>fully open</strong> position before starting.</span>
              </li>
              <li>
                <span class="step-num">2</span>
                <span>Tap <strong>Start Calibration</strong>. The device will move the servo through its range automatically.</span>
              </li>
              <li>
                <span class="step-num">3</span>
                <span>Wait approximately 16 seconds. Do not move the device until "Calibration complete" appears.</span>
              </li>
            </ol>
            <div class="action-row">
              <button class="btn"
                ?disabled=${dis || this.zeroResult.state === 'running'}
                @click=${this._servoZero}>
                ${this.zeroResult.state === 'running' ? 'Calibrating…' : 'Start Calibration'}
              </button>
              ${this.zeroResult.state === 'running' ? html`
                <span class="zero-progress">~${this.zeroSecondsLeft}s remaining</span>
              ` : this._badgeR(this.zeroResult)}
            </div>
          </div>

          <!-- Log Management -->
          <div class="card">
            <div class="card-title">Log Management</div>

            <div class="action-row">
              <span class="action-label">Log level</span>
              <select class="input" .value=${this.logSink}
                @change=${(e: Event) => { this.logSink = (e.target as HTMLSelectElement).value as any; }}
                ?disabled=${dis}>
                <option value="serial">serial</option>
                <option value="file">file</option>
                <option value="ble">ble</option>
              </select>
              <select class="input" .value=${this.logLevel}
                @change=${(e: Event) => { this.logLevel = (e.target as HTMLSelectElement).value as any; }}
                ?disabled=${dis}>
                <option value="verbose">verbose</option>
                <option value="debug">debug</option>
                <option value="info">info</option>
                <option value="warn">warn</option>
                <option value="error">error</option>
                <option value="none">none</option>
              </select>
              <button class="btn" ?disabled=${dis} @click=${this._setLogLevel}>
                Set
              </button>
              ${this._badgeR(this.logLevelResult)}
            </div>

            <div class="action-row">
              <span class="action-label">Fetch logs</span>
              <input class="input input-sm" type="number" placeholder="from #0" min="0" step="1"
                .value=${this.logsFrom}
                @input=${(e: Event) => { this.logsFrom = (e.target as HTMLInputElement).value; }}
                ?disabled=${dis} />
              <button class="btn" ?disabled=${dis || this.getLogsResult.state === 'running'}
                @click=${this._getLogs}>
                Get Logs
              </button>
              ${this._badgeR(this.getLogsResult)}
              ${this.logsOutput.length > 0 ? html`
                <div class="logs-output">${this.logsOutput.join('\n')}</div>
              ` : ''}
            </div>

            <div class="action-row">
              <span class="action-label">Clear system logs</span>
              ${this.clearLogsConfirm ? html`
                <span class="confirm-note">This is irreversible.</span>
                <button class="btn btn-confirm" ?disabled=${dis} @click=${this._clearLogs}>
                  Confirm clear
                </button>
                <button class="btn" @click=${() => { this.clearLogsConfirm = false; }}>Cancel</button>
              ` : html`
                <button class="btn btn-danger"
                  ?disabled=${dis || this.clearLogsResult.state === 'running'}
                  @click=${() => { this.clearLogsConfirm = true; }}>
                  Clear Logs
                </button>
                ${this._badgeR(this.clearLogsResult)}
              `}
            </div>

            <div class="action-row">
              <span class="action-label">Clear all run files</span>
              ${this.clearStateConfirm ? html`
                <span class="confirm-note">Deletes all runs — irreversible.</span>
                <button class="btn btn-confirm" ?disabled=${dis} @click=${this._clearStateLogs}>
                  Confirm clear
                </button>
                <button class="btn" @click=${() => { this.clearStateConfirm = false; }}>Cancel</button>
              ` : html`
                <button class="btn btn-danger"
                  ?disabled=${dis || this.clearStateResult.state === 'running'}
                  @click=${() => { this.clearStateConfirm = true; }}>
                  Clear State Logs
                </button>
                ${this._badgeR(this.clearStateResult)}
              `}
            </div>

          </div>

        </div>
      </main>
    `;
  }
}
