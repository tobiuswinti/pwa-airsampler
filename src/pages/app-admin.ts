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

  // ── Mechanical ────────────────────────────────────────────────────────
  @state() private fanFlowrate    = '1.0';
  @state() private fanResult      = idle();

  @state() private servoUnit: 'mm' | 'deg' = 'mm';
  @state() private servoValue     = '';
  @state() private servoResult    = idle();

  @state() private zeroResult     = idle();
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

  // ── Fan ───────────────────────────────────────────────────────────────

  private async _setFan() {
    if (!this.fanFlowrate.trim()) return;
    await this._run(
      `setFan -flowrate ${this.fanFlowrate}`,
      r => { this.fanResult = r; },
    );
  }

  // ── Servo ─────────────────────────────────────────────────────────────

  private async _setServo() {
    if (!this.servoValue.trim()) return;
    const flag = this.servoUnit === 'mm' ? '-mm' : '-deg';
    await this._run(
      `setServo ${flag} ${this.servoValue}`,
      r => { this.servoResult = r; },
    );
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

    if (this._isOk(lines)) {
      this.zeroResult = { state: 'ok', msg: 'Calibration complete' };
    } else {
      this.zeroResult = { state: 'error', msg: this._errMsg(lines) };
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

  private _badge(r: ActionResult) {
    if (r.state === 'idle') return '';
    if (r.state === 'running') return html`<span class="badge running">…</span>`;
    if (r.state === 'ok')     return html`<span class="badge ok">${r.msg || 'OK'}</span>`;
    return html`<span class="badge error">${r.msg}</span>`;
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

    .connect-banner {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      border: 1px solid rgba(59,130,246,0.3);
      border-radius: 12px;
      background: rgba(59,130,246,0.06);
      color: #93c5fd;
      font-family: var(--sans);
      text-decoration: none;
      transition: border-color 0.15s, background 0.15s;
    }

    .connect-banner:hover {
      border-color: rgba(59,130,246,0.5);
      background: rgba(59,130,246,0.1);
    }

    .connect-banner .cb-icon {
      width: 40px; height: 40px;
      border-radius: 10px;
      background: rgba(59,130,246,0.1);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }

    .connect-banner .cb-label {
      flex: 1;
      font-size: 0.9375rem;
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .connect-banner .cb-arrow {
      color: rgba(147,197,253,0.5);
      font-size: 1.1rem;
    }

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

    .action-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

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
  `;

  // ── Render ────────────────────────────────────────────────────────────

  render() {
    const dis = !this.connected;

    return html`
      <main>
        <div class="page-header">
          <a class="back-btn" href="${resolveRouterPath()}">←</a>
          <span class="page-title">Admin</span>
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

          <!-- Mechanical -->
          <div class="card">
            <div class="card-title">Mechanical</div>

            <!-- setFan -->
            <div class="action-row">
              <span class="action-label">Fan override</span>
              <input class="input input-sm" type="number" placeholder="1.0" step="0.1" min="0"
                .value=${this.fanFlowrate}
                @input=${(e: Event) => { this.fanFlowrate = (e.target as HTMLInputElement).value; }}
                ?disabled=${dis} />
              <span class="unit">L/s</span>
              <button class="btn" ?disabled=${dis || !this.fanFlowrate.trim()} @click=${this._setFan}>
                Set Fan
              </button>
              ${this._badge(this.fanResult)}
            </div>

            <!-- setServo -->
            <div class="action-row">
              <span class="action-label">Servo position</span>
              <div class="segment-group">
                <button class="segment ${this.servoUnit === 'mm' ? 'active' : ''}"
                  @click=${() => { this.servoUnit = 'mm'; this.servoValue = ''; }}>mm</button>
                <button class="segment ${this.servoUnit === 'deg' ? 'active' : ''}"
                  @click=${() => { this.servoUnit = 'deg'; this.servoValue = ''; }}>deg</button>
              </div>
              <input class="input input-sm" type="number"
                placeholder="${this.servoUnit === 'mm' ? 'e.g. 10' : 'e.g. 90'}"
                step="${this.servoUnit === 'mm' ? '0.1' : '1'}"
                .value=${this.servoValue}
                @input=${(e: Event) => { this.servoValue = (e.target as HTMLInputElement).value; }}
                ?disabled=${dis} />
              <span class="unit">${this.servoUnit}</span>
              <button class="btn" ?disabled=${dis || !this.servoValue.trim()} @click=${this._setServo}>
                Set Servo
              </button>
              ${this._badge(this.servoResult)}
            </div>

            <!-- servoZero -->
            <div class="action-row">
              <span class="action-label">Servo calibration</span>
              <button class="btn"
                ?disabled=${dis || this.zeroResult.state === 'running'}
                @click=${this._servoZero}>
                ${this.zeroResult.state === 'running' ? 'Calibrating…' : 'Run servoZero'}
              </button>
              ${this.zeroResult.state === 'running' ? html`
                <span class="zero-progress">~${this.zeroSecondsLeft}s remaining</span>
              ` : this._badge(this.zeroResult)}
            </div>
          </div>

          <!-- Log Management -->
          <div class="card">
            <div class="card-title">Log Management</div>

            <!-- setLogLevel -->
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
              ${this._badge(this.logLevelResult)}
            </div>

            <!-- getLogs -->
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
              ${this._badge(this.getLogsResult)}
              ${this.logsOutput.length > 0 ? html`
                <div class="logs-output">${this.logsOutput.join('\n')}</div>
              ` : ''}
            </div>

            <!-- clearLogs -->
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
                ${this._badge(this.clearLogsResult)}
              `}
            </div>

            <!-- clearStateLogs -->
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
                ${this._badge(this.clearStateResult)}
              `}
            </div>

          </div>

        </div>
      </main>
    `;
  }
}
