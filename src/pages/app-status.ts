import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import { bleService, ConnStatus, LiveState } from '../ble-service';

interface HistPoint {
  ts: number;
  soc: number; voltage: number; current: number; power: number; tte: number;
  temperature: number; humidity: number; pressure: number;
  flowrate: number; flowrateSP: number;
  fanRpm: number; servoMm: number;
}

const MAX_HIST = 600; // 10 min at 1 Hz

@customElement('app-status')
export class AppStatus extends LitElement {

  @state() private connStatus: ConnStatus = bleService.connStatus;
  @state() private liveState: LiveState | null = bleService.liveState;
  @state() private sysLog: string[] = [...bleService.sysLog];

  private _hist: HistPoint[] = [];

  private _onStatus = () => { this.connStatus = bleService.connStatus; };
  private _onState  = () => {
    this.liveState = bleService.liveState;
    const s = bleService.liveState;
    if (s) {
      this._hist = [...this._hist.slice(-(MAX_HIST - 1)), {
        ts:          Date.now(),
        soc:         s.soc         ?? 0,
        voltage:     s.voltage     ?? 0,
        current:     s.current     ?? 0,
        power:       s.power       ?? 0,
        tte:         s.tte         ?? 0,
        temperature: s.temperature ?? 0,
        humidity:    s.humidity    ?? 0,
        pressure:    s.pressure    ?? 0,
        flowrate:    s.flowrate    ?? 0,
        flowrateSP:  s.flowrateSP  ?? 0,
        fanRpm:      s.fanRpm      ?? 0,
        servoMm:     s.servoMm     ?? 0,
      }];
    }
  };
  private _onLog = () => { this.sysLog = [...bleService.sysLog]; };

  connectedCallback() {
    super.connectedCallback();
    bleService.addEventListener('status-changed', this._onStatus);
    bleService.addEventListener('state-changed',  this._onState);
    bleService.addEventListener('log-changed',    this._onLog);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    bleService.removeEventListener('status-changed', this._onStatus);
    bleService.removeEventListener('state-changed',  this._onState);
    bleService.removeEventListener('log-changed',    this._onLog);
  }

  updated() {
    this._drawAllSparks();
  }

  // ── Sparkline drawing ────────────────────────────────────────────────────

  private _drawAllSparks() {
    if (this._hist.length < 2) return;
    const h = this._hist;
    const vals = (key: keyof Omit<HistPoint, 'ts'>) => h.map(p => p[key] as number);
    this._spark('spark-soc',         vals('soc'),         '#22c55e');
    this._spark('spark-voltage',     vals('voltage'),     '#a78bfa');
    this._spark('spark-current',     vals('current'),     '#64748b');
    this._spark('spark-power',       vals('power'),       '#f97316');
    this._spark('spark-tte',         vals('tte'),         '#06b6d4');
    this._spark('spark-fanrpm',      vals('fanRpm'),      '#71717a');
    this._spark('spark-temperature', vals('temperature'), '#f97316');
    this._spark('spark-humidity',    vals('humidity'),    '#06b6d4');
    this._spark('spark-pressure',    vals('pressure'),    '#6366f1');
    this._spark('spark-flowrate',    vals('flowrate'),    '#3b82f6');
    this._spark('spark-flowratesp',  vals('flowrateSP'),  '#f59e0b');
    this._spark('spark-servo',       vals('servoMm'),     '#84cc16');
  }

  private _spark(id: string, vals: number[], color: string) {
    const canvas = this.shadowRoot?.querySelector<HTMLCanvasElement>(`#${id}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width, H = rect.height;
    ctx.clearRect(0, 0, W, H);

    let min = Infinity, max = -Infinity;
    for (const v of vals) { if (isFinite(v)) { min = Math.min(min, v); max = Math.max(max, v); } }
    if (!isFinite(min)) return;
    if (min === max) { min -= 0.5; max += 0.5; }
    const pad = (max - min) * 0.15;
    min -= pad; max += pad;

    const PT = 2, PB = 2, cH = H - PT - PB;
    const xStep = W / (vals.length - 1);
    const toY   = (v: number) => PT + cH * (1 - (v - min) / (max - min));

    // Subtle gradient fill
    const grad = ctx.createLinearGradient(0, PT, 0, H);
    grad.addColorStop(0, color + '28');
    grad.addColorStop(1, color + '00');
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let i = 0; i < vals.length; i++) ctx.lineTo(i * xStep, toY(vals[i]));
    ctx.lineTo((vals.length - 1) * xStep, H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Trendline
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(0, toY(vals[0]));
    for (let i = 1; i < vals.length; i++) ctx.lineTo(i * xStep, toY(vals[i]));
    ctx.stroke();

    // Dot at latest point
    ctx.beginPath();
    ctx.arc((vals.length - 1) * xStep, toY(vals[vals.length - 1]), 2.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private _fmt(v: number | undefined, dec: number, unit: string) {
    if (v == null) return '—';
    return `${v.toFixed(dec)}${unit ? '\u202f' + unit : ''}`;
  }

  private _samplingBadge(s: string) {
    if (s === 'running') return { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e', border: 'rgba(34,197,94,0.3)' };
    if (s === 'paused')  return { bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b', border: 'rgba(245,158,11,0.3)' };
    if (s === 'waiting') return { bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6', border: 'rgba(59,130,246,0.3)' };
    return                      { bg: 'rgba(113,113,122,0.12)', color: '#71717a', border: 'rgba(113,113,122,0.3)' };
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  static styles = css`
    :host {
      --bg:       #09090b;
      --card:     #09090b;
      --border:   #27272a;
      --fg:       #fafafa;
      --muted-fg: #71717a;
      --mono: 'Share Tech Mono', monospace;
      --sans: 'Geist', 'Inter', system-ui, sans-serif;
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
      max-width: 680px;
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
      text-decoration: none;
      font-size: 1rem;
      flex-shrink: 0;
      transition: color 0.15s, border-color 0.15s;
    }

    .back-btn:hover { color: var(--fg); border-color: #52525b; }

    .page-title {
      font-size: 0.875rem;
      font-weight: 600;
      letter-spacing: 0.01em;
      color: var(--fg);
    }

    .content {
      width: 100%;
      max-width: 680px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .alert {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border: 1px solid #3f1f1a;
      border-radius: 8px;
      background: rgba(239,68,68,0.06);
      font-size: 0.8125rem;
      color: #fca5a5;
    }

    .alert a {
      margin-left: auto;
      font-size: 0.75rem;
      font-family: var(--mono);
      color: var(--fg);
      border: 1px solid var(--border);
      padding: 3px 10px;
      border-radius: 5px;
      text-decoration: none;
      white-space: nowrap;
      transition: border-color 0.15s;
    }

    .alert a:hover { border-color: #52525b; }

    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px 18px;
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
    }

    .card-title {
      font-size: 0.75rem;
      font-weight: 500;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--muted-fg);
    }

    .sampling-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      border: 1px solid;
    }

    .badge-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: currentColor;
    }

    .badge-dot.pulse { animation: pulse 2s ease-in-out infinite; }

    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

    /* ── Stats grid ── */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1px;
      background: var(--border);
      border-radius: 6px;
      overflow: hidden;
    }

    .stat-cell {
      background: var(--card);
      padding: 12px 14px 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow: hidden;
    }

    .stat-label {
      font-size: 0.65rem;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted-fg);
    }

    .stat-value {
      font-family: var(--mono);
      font-size: 1rem;
      font-weight: 600;
      color: var(--fg);
      letter-spacing: -0.01em;
    }

    canvas.spark {
      width: 100%;
      height: 38px;
      display: block;
      margin-top: 6px;
    }

    .ts-line {
      font-family: var(--mono);
      font-size: 0.65rem;
      color: var(--muted-fg);
      margin-top: 10px;
    }

    .waiting-msg {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--muted-fg);
      padding: 12px 0;
    }

    /* ── Log ── */
    .log-clear-btn {
      font-family: var(--mono);
      font-size: 0.65rem;
      letter-spacing: 0.04em;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--muted-fg);
      padding: 3px 10px;
      border-radius: 5px;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
    }

    .log-clear-btn:hover { color: #ef4444; border-color: #ef4444; }

    .log-box {
      max-height: 240px;
      overflow-y: auto;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px 12px;
      background: rgba(255,255,255,0.015);
    }

    .log-entry {
      font-family: var(--mono);
      font-size: 0.65rem;
      line-height: 1.7;
      color: var(--muted-fg);
    }

    @media (max-width: 480px) {
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
    }
  `;

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    const connected = this.connStatus === 'connected';
    const s         = this.liveState;
    const badge     = s ? this._samplingBadge(s.samplingState) : null;

    return html`
      <main>
        <div class="page-header">
          <a class="back-btn" href="${resolveRouterPath()}">←</a>
          <span class="page-title">Status</span>
        </div>

        <div class="content">

          ${!connected ? html`
            <div class="alert">
              <span>Device not connected</span>
              <a href="${resolveRouterPath('connect')}">Connect →</a>
            </div>
          ` : ''}

          <div class="card">
            <div class="card-header">
              <span class="card-title">Live State</span>
              ${badge && s ? html`
                <span class="sampling-badge"
                  style="color:${badge.color};background:${badge.bg};border-color:${badge.border};">
                  <span class="badge-dot ${s.samplingState === 'running' ? 'pulse' : ''}"></span>
                  ${s.samplingState}
                </span>
              ` : ''}
            </div>

            ${s ? html`
              <div class="stats-grid">

                <div class="stat-cell">
                  <span class="stat-label">SoC</span>
                  <span class="stat-value">${this._fmt(s.soc, 1, '%')}</span>
                  <canvas id="spark-soc" class="spark"></canvas>
                </div>
                <div class="stat-cell">
                  <span class="stat-label">Voltage</span>
                  <span class="stat-value">${this._fmt(s.voltage, 2, 'V')}</span>
                  <canvas id="spark-voltage" class="spark"></canvas>
                </div>
                <div class="stat-cell">
                  <span class="stat-label">Current</span>
                  <span class="stat-value">${this._fmt(s.current, 3, 'A')}</span>
                  <canvas id="spark-current" class="spark"></canvas>
                </div>

                <div class="stat-cell">
                  <span class="stat-label">Power</span>
                  <span class="stat-value">${this._fmt(s.power, 2, 'W')}</span>
                  <canvas id="spark-power" class="spark"></canvas>
                </div>
                <div class="stat-cell">
                  <span class="stat-label">Remaining Runtime</span>
                  <span class="stat-value">${this._fmt(s.tte, 2, 'h')}</span>
                  <canvas id="spark-tte" class="spark"></canvas>
                </div>
                <div class="stat-cell">
                  <span class="stat-label">Fan Speed</span>
                  <span class="stat-value">${this._fmt(s.fanRpm, 0, 'rpm')}</span>
                  <canvas id="spark-fanrpm" class="spark"></canvas>
                </div>

                <div class="stat-cell">
                  <span class="stat-label">Temp</span>
                  <span class="stat-value">${this._fmt(s.temperature, 1, '°C')}</span>
                  <canvas id="spark-temperature" class="spark"></canvas>
                </div>
                <div class="stat-cell">
                  <span class="stat-label">Humidity</span>
                  <span class="stat-value">${this._fmt(s.humidity, 1, '%RH')}</span>
                  <canvas id="spark-humidity" class="spark"></canvas>
                </div>
                <div class="stat-cell">
                  <span class="stat-label">Pressure</span>
                  <span class="stat-value">${this._fmt(s.pressure, 0, 'Pa')}</span>
                  <canvas id="spark-pressure" class="spark"></canvas>
                </div>

                <div class="stat-cell">
                  <span class="stat-label">Flowrate</span>
                  <span class="stat-value">${this._fmt(s.flowrate, 4, 'L/s')}</span>
                  <canvas id="spark-flowrate" class="spark"></canvas>
                </div>
                <div class="stat-cell">
                  <span class="stat-label">Flow SP</span>
                  <span class="stat-value">${this._fmt(s.flowrateSP, 4, 'L/s')}</span>
                  <canvas id="spark-flowratesp" class="spark"></canvas>
                </div>
                <div class="stat-cell">
                  <span class="stat-label">Servo</span>
                  <span class="stat-value">${this._fmt(s.servoMm, 2, 'mm')}</span>
                  <canvas id="spark-servo" class="spark"></canvas>
                </div>

              </div>
              <div class="ts-line">${s.ts}</div>
            ` : html`
              <p class="waiting-msg">Waiting for state broadcast…</p>
            `}
          </div>

          <!-- System log -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">System Log</span>
              ${this.sysLog.length > 0 ? html`
                <button class="log-clear-btn"
                  @click=${() => { bleService.sysLog = []; this.sysLog = []; }}>
                  Clear
                </button>
              ` : ''}
            </div>
            <div class="log-box">
              ${this.sysLog.length === 0
                ? html`<p class="log-entry">No entries yet.</p>`
                : this.sysLog.map(l => html`<p class="log-entry">${l}</p>`)}
            </div>
          </div>

        </div>
      </main>
    `;
  }
}
