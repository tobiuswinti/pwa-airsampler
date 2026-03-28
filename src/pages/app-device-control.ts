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

@customElement('app-device-control')
export class AppDeviceControl extends LitElement {

  @state() private connected = bleService.connStatus === 'connected';

  // ── Mechanical ────────────────────────────────────────────────────────
  @state() private fanFlowrate = '1.0';
  @state() private fanResult   = idle();

  @state() private servoUnit: 'mm' | 'deg' = 'mm';
  @state() private servoValue  = '';
  @state() private servoResult = idle();

  private _onStatus = () => { this.connected = bleService.connStatus === 'connected'; };

  connectedCallback() {
    super.connectedCallback();
    bleService.addEventListener('status-changed', this._onStatus);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    bleService.removeEventListener('status-changed', this._onStatus);
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private _isOk(lines: string[]) { return lines.some(l => l.startsWith('OK')); }

  private _errMsg(lines: string[]): string {
    return lines.find(l => l.startsWith('ERROR')) ?? lines[0] ?? 'Unknown error';
  }

  private async _run(cmd: string, setResult: (r: ActionResult) => void): Promise<void> {
    setResult({ state: 'running', msg: '' });
    const lines = await bleService.sendCmd(cmd);
    if (this._isOk(lines)) {
      setResult({ state: 'ok', msg: 'Done' });
    } else {
      setResult({ state: 'error', msg: this._errMsg(lines) });
    }
  }

  private async _setFan() {
    if (!this.fanFlowrate.trim()) return;
    await this._run(`setFan -flowrate ${this.fanFlowrate}`, r => { this.fanResult = r; });
  }

  private async _setServo() {
    if (!this.servoValue.trim()) return;
    const flag = this.servoUnit === 'mm' ? '-mm' : '-deg';
    await this._run(`setServo ${flag} ${this.servoValue}`, r => { this.servoResult = r; });
  }

  // ── Render helpers ────────────────────────────────────────────────────

  private _badge(r: ActionResult) {
    if (r.state === 'idle')    return '';
    if (r.state === 'running') return html`<span class="badge running">…</span>`;
    if (r.state === 'ok')      return html`<span class="badge ok">${r.msg || 'OK'}</span>`;
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
      margin-bottom: 4px;
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

  `;

  // ── Render ────────────────────────────────────────────────────────────

  render() {
    const dis = !this.connected;

    return html`
      <main>
        <div class="page-header">
          <a class="back-btn" href="${resolveRouterPath()}">←</a>
          <span class="page-title">Device Control</span>
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
          </div>

        </div>
      </main>
    `;
  }
}
