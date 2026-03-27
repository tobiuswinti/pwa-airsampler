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

const MAX_HIST = 600;

@customElement('app-status')
export class AppStatus extends LitElement {

  @state() private connStatus: ConnStatus = bleService.connStatus;
  @state() private liveState: LiveState | null = bleService.liveState;
  @state() private sysLog: string[] = [...bleService.sysLog];
  @state() private _stopConfirm = false;

  private _hist: HistPoint[] = [];

  private _onStatus = () => { this.connStatus = bleService.connStatus; };
  private _onState  = () => {
    this.liveState = bleService.liveState;
    const s = bleService.liveState;
    if (s && s.samplingState !== 'running' && s.samplingState !== 'waiting' && s.samplingState !== 'paused') {
      this._stopConfirm = false;
    }
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
  private _onLog   = () => { this.sysLog = [...bleService.sysLog]; };

  private async _stopSampling() {
    this._stopConfirm = false;
    await bleService.sendCmd('stopSampling');
  }

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

  // ── Sparklines ────────────────────────────────────────────────────────────

  private _drawAllSparks() {
    if (this._hist.length < 2) return;
    const h = this._hist;
    const v = (key: keyof Omit<HistPoint, 'ts'>) => h.map(p => p[key] as number);
    this._spark('spark-flowrate',    v('flowrate'),    '#3b82f6');
    this._spark('spark-flowratesp',  v('flowrateSP'),  '#f59e0b');
    this._spark('spark-fanrpm',      v('fanRpm'),      '#71717a');
    this._spark('spark-servo',       v('servoMm'),     '#84cc16');
    this._spark('spark-soc',         v('soc'),         '#22c55e');
    this._spark('spark-voltage',     v('voltage'),     '#a78bfa');
    this._spark('spark-current',     v('current'),     '#64748b');
    this._spark('spark-power',       v('power'),       '#f97316');
    this._spark('spark-tte',         v('tte'),         '#06b6d4');
    this._spark('spark-temperature', v('temperature'), '#f97316');
    this._spark('spark-humidity',    v('humidity'),    '#06b6d4');
    this._spark('spark-pressure',    v('pressure'),    '#6366f1');
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
    const xStep = W / Math.max(vals.length - 1, 1);
    const toY   = (v: number) => PT + cH * (1 - (v - min) / (max - min));

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

    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(0, toY(vals[0]));
    for (let i = 1; i < vals.length; i++) ctx.lineTo(i * xStep, toY(vals[i]));
    ctx.stroke();

    ctx.beginPath();
    ctx.arc((vals.length - 1) * xStep, toY(vals[vals.length - 1]), 2.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _fmtSec(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  private _fmt(v: number | undefined, dec: number, unit: string) {
    if (v == null) return '—';
    return `${v.toFixed(dec)}${unit ? '\u202f' + unit : ''}`;
  }

  private _stateColor(s: string): { color: string; bg: string; border: string } {
    if (s === 'running') return { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)' };
    if (s === 'paused')  return { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)' };
    if (s === 'waiting') return { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.3)' };
    return                      { color: '#71717a', bg: 'rgba(113,113,122,0.08)', border: 'rgba(113,113,122,0.3)' };
  }

  private _socColor(soc: number): string {
    if (soc > 50) return '#22c55e';
    if (soc > 20) return '#f59e0b';
    return '#ef4444';
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  static styles = css`
    :host {
      --bg:       #09090b;
      --card:     #111113;
      --border:   #58585f;
      --fg:       #ffffff;
      --muted-fg: #c4c4cc;
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
      max-width: 600px;
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
      color: var(--fg);
    }

    .content {
      width: 100%;
      max-width: 600px;
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
    }

    /* ── Cards ── */
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px 18px;
    }

    .card-label {
      font-size: 0.65rem;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted-fg);
      margin-bottom: 14px;
    }

    .waiting-msg {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--muted-fg);
      padding: 8px 0;
    }

    /* ── Sampling hero card ── */
    .hero-layout {
      display: flex;
      gap: 16px;
      align-items: stretch;
    }

    .hero-data {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .device-img {
      width: 90px;
      flex-shrink: 0;
      border-radius: 6px;
      object-fit: cover;
      object-position: center top;
      opacity: 0.88;
      align-self: stretch;
    }

    .hero-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 18px;
    }

    .state-badge {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 5px 13px;
      border-radius: 20px;
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      border: 1px solid;
    }

    .badge-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: currentColor;
      flex-shrink: 0;
    }

    .badge-dot.pulse { animation: pulse 2s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }

    .ts-label {
      font-family: var(--mono);
      font-size: 0.62rem;
      color: var(--muted-fg);
    }

    /* Flowrate display */
    .flow-row {
      display: flex;
      align-items: baseline;
      gap: 6px;
      margin-bottom: 10px;
    }

    .flow-value {
      font-family: var(--mono);
      font-size: 2.5rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: var(--fg);
      line-height: 1;
    }

    .flow-unit {
      font-family: var(--mono);
      font-size: 0.875rem;
      color: var(--muted-fg);
    }

    .flow-sp {
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--muted-fg);
      margin-left: auto;
    }

    /* Setpoint bar */
    .flow-bar-track {
      height: 4px;
      background: #27272a;
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 16px;
    }

    .flow-bar-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.4s ease;
    }

    /* Secondary metrics inline */
    .inline-metrics {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }

    .inline-metric {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .inline-label {
      font-size: 0.62rem;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted-fg);
    }

    .inline-value {
      font-family: var(--mono);
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--fg);
    }

    /* ── Power card ── */
    .battery-bar-track {
      height: 8px;
      background: #222226;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 6px;
    }

    .battery-bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.6s ease;
    }

    .battery-labels {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 16px;
    }

    .battery-pct {
      font-family: var(--mono);
      font-size: 1.625rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1;
    }

    .battery-tte {
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--muted-fg);
    }

    /* ── Stats grid (power + env) ── */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      column-gap: 8px;
    }

    .stat-cell {
      background: transparent;
      padding: 10px 0 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow: hidden;
    }

    .stat-label {
      font-size: 0.6rem;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted-fg);
    }

    .stat-value {
      font-family: var(--mono);
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--fg);
      letter-spacing: -0.01em;
    }

    canvas.spark {
      width: 100%;
      height: 32px;
      display: block;
      margin-top: 6px;
    }

    /* ── Log ── */
    .card-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }

    .log-clear-btn {
      font-family: var(--mono);
      font-size: 0.65rem;
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
      max-height: 220px;
      overflow-y: auto;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px 12px;
      background: rgba(255,255,255,0.03);
    }

    .log-entry {
      font-family: var(--mono);
      font-size: 0.65rem;
      line-height: 1.7;
      color: var(--muted-fg);
    }

    .divider {
      height: 1px;
      background: var(--border);
      margin: 14px 0;
    }

    /* ── Sampling progress card ── */
    .sampling-state-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    .sampling-elapsed-big {
      font-family: var(--mono);
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      line-height: 1;
      color: var(--fg);
    }

    .sampling-elapsed-label {
      font-family: var(--mono);
      font-size: 0.62rem;
      color: var(--muted-fg);
      margin-top: 4px;
    }

    .sampling-progress-track {
      height: 6px;
      border-radius: 3px;
      background: #27272a;
      overflow: hidden;
      margin-bottom: 14px;
    }

    .sampling-progress-fill {
      height: 100%;
      border-radius: 3px;
    }

    .sampling-progress-fill.indeterminate {
      width: 40%;
      animation: slide-indeterminate 1.8s ease-in-out infinite;
      transform-origin: left;
    }

    @keyframes slide-indeterminate {
      0%   { transform: translateX(-100%); }
      100% { transform: translateX(350%); }
    }

    .sampling-info-row {
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
    }

    .sampling-info-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .sampling-info-label {
      font-size: 0.6rem;
      font-weight: 500;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: var(--muted-fg);
    }

    .sampling-info-value {
      font-family: var(--mono);
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--fg);
    }

    .sampling-idle-msg {
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--muted-fg);
      padding: 8px 0;
    }

    .sampling-stop-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid #27272a;
      flex-wrap: wrap;
    }

    .btn-stop-sampling {
      font-family: var(--sans);
      font-size: 0.8rem;
      font-weight: 500;
      padding: 6px 14px;
      border-radius: 6px;
      border: 1px solid #7f1d1d;
      background: rgba(239,68,68,0.06);
      color: #fca5a5;
      cursor: pointer;
      transition: background 0.15s;
      white-space: nowrap;
    }

    .btn-stop-sampling:hover { background: rgba(239,68,68,0.12); }

    .btn-stop-confirm {
      font-family: var(--sans);
      font-size: 0.8rem;
      font-weight: 500;
      padding: 6px 14px;
      border-radius: 6px;
      border: 1px solid #ef4444;
      background: rgba(239,68,68,0.10);
      color: #f87171;
      cursor: pointer;
      animation: stop-pulse 0.8s ease-in-out infinite;
      white-space: nowrap;
    }

    @keyframes stop-pulse {
      0%, 100% { border-color: #ef4444; }
      50%       { border-color: #7f1d1d; }
    }

    .btn-stop-cancel {
      font-family: var(--sans);
      font-size: 0.8rem;
      padding: 6px 12px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted-fg);
      cursor: pointer;
      white-space: nowrap;
    }

    .btn-stop-cancel:hover { border-color: #52525b; color: var(--fg); }

    .stop-warn {
      font-family: var(--mono);
      font-size: 0.68rem;
      color: #f87171;
    }

    @media (max-width: 420px) {
      .flow-value { font-size: 2rem; }
      .stats-row  { grid-template-columns: repeat(2, 1fr); }
    }
  `;

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    const connected = this.connStatus === 'connected';
    const s         = this.liveState;

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

          <!-- ── Sampling card ── -->
          <div class="card">
            ${s ? (() => {
              const sc       = this._stateColor(s.samplingState);
              const sp       = s.flowrateSP || 1;
              const pct      = Math.min(100, (s.flowrate / sp) * 100);
              const barColor = Math.abs(pct - 100) < 5  ? '#22c55e'
                             : Math.abs(pct - 100) < 15 ? '#f59e0b'
                             : '#ef4444';
              return html`
                <div class="hero-layout">
                  <div class="hero-data">
                    <div class="hero-top">
                      <span class="state-badge"
                        style="color:${sc.color};background:${sc.bg};border-color:${sc.border};">
                        <span class="badge-dot ${s.samplingState === 'running' ? 'pulse' : ''}"></span>
                        ${s.samplingState}
                      </span>
                      <span class="ts-label">${s.ts}</span>
                    </div>

                    <div class="flow-row">
                      <span class="flow-value">${s.flowrate.toFixed(3)}</span>
                      <span class="flow-unit">L/s</span>
                      <span class="flow-sp">SP&nbsp;${s.flowrateSP.toFixed(3)}&nbsp;L/s</span>
                    </div>
                    <div class="flow-bar-track">
                      <div class="flow-bar-fill"
                        style="width:${pct}%;background:${barColor};"></div>
                    </div>

                    <div class="inline-metrics">
                      <div class="inline-metric">
                        <span class="inline-label">Fan</span>
                        <span class="inline-value">${this._fmt(s.fanRpm, 0, 'rpm')}</span>
                      </div>
                      <div class="inline-metric">
                        <span class="inline-label">Servo</span>
                        <span class="inline-value">${this._fmt(s.servoMm, 2, 'mm')}</span>
                      </div>
                    </div>
                  </div>

                  <img class="device-img"
                    src="/pwa-airsampler/assets/device/DeviceV8_2.jpg"
                    alt="AirSampler device">
                </div>
              `;
            })() : html`
              <div class="hero-layout">
                <div class="hero-data">
                  <p class="waiting-msg">Waiting for state broadcast…</p>
                </div>
                <img class="device-img"
                  src="/pwa-airsampler/assets/device/DeviceV8_2.jpg"
                  alt="AirSampler device">
              </div>
            `}
          </div>

          <!-- ── Sampling progress card ── -->
          ${s ? (() => {
            const ss       = s.samplingState;
            const sc       = this._stateColor(ss);
            const elapsedS = s.elapsedS  ?? 0;
            const remainS  = s.remainingS ?? 0;
            const totalS   = elapsedS + remainS;
            const pct      = totalS > 0 ? Math.min(100, (elapsedS / totalS) * 100) : 0;
            const isRunning = ss === 'running';
            const isWaiting = ss === 'waiting';
            const isPaused  = ss === 'paused';
            const isActive  = isRunning || isWaiting || isPaused;

            return html`
              <div class="card">
                <div class="sampling-state-row">
                  <div>
                    ${isRunning || isPaused ? html`
                      <div class="sampling-elapsed-big">${this._fmtSec(elapsedS)}</div>
                      <div class="sampling-elapsed-label">${isRunning ? 'elapsed' : 'paused at'}</div>
                    ` : isWaiting ? html`
                      <div class="sampling-elapsed-big">${this._fmtSec(remainS)}</div>
                      <div class="sampling-elapsed-label">starts in</div>
                    ` : html`
                      <div class="sampling-elapsed-big">—</div>
                      <div class="sampling-elapsed-label">not sampling</div>
                    `}
                  </div>
                  <span class="state-badge"
                    style="color:${sc.color};background:${sc.bg};border-color:${sc.border};">
                    <span class="badge-dot ${isRunning ? 'pulse' : ''}"></span>
                    ${ss}
                  </span>
                </div>

                <div class="sampling-progress-track">
                  ${isRunning ? html`
                    <div class="sampling-progress-fill"
                      style="background:${sc.color};width:${pct}%;transition:width 1s linear;"></div>
                  ` : isWaiting ? html`
                    <div class="sampling-progress-fill indeterminate"
                      style="background:#3b82f6;opacity:0.6;"></div>
                  ` : isPaused ? html`
                    <div class="sampling-progress-fill"
                      style="background:#f59e0b;width:${pct}%;opacity:0.5;"></div>
                  ` : html`
                    <div style="width:100%;height:100%;background:#27272a;border-radius:3px;"></div>
                  `}
                </div>

                ${isActive ? html`
                  <div class="sampling-info-row">
                    ${isRunning || isPaused ? html`
                      <div class="sampling-info-item">
                        <span class="sampling-info-label">Remaining</span>
                        <span class="sampling-info-value" style="color:${sc.color}">${this._fmtSec(remainS)}</span>
                      </div>
                    ` : ''}
                    <div class="sampling-info-item">
                      <span class="sampling-info-label">Flow</span>
                      <span class="sampling-info-value" style="color:#3b82f6">${s.flowrate.toFixed(3)} L/s</span>
                    </div>
                    <div class="sampling-info-item">
                      <span class="sampling-info-label">Setpoint</span>
                      <span class="sampling-info-value">${s.flowrateSP.toFixed(3)} L/s</span>
                    </div>
                    <div class="sampling-info-item">
                      <span class="sampling-info-label">Temp</span>
                      <span class="sampling-info-value" style="color:#f97316">${this._fmt(s.temperature, 1, '°C')}</span>
                    </div>
                  </div>
                  <div class="sampling-stop-row">
                    ${this._stopConfirm ? html`
                      <span class="stop-warn">Stop and save current run?</span>
                      <button class="btn-stop-confirm" @click=${this._stopSampling}>Confirm stop</button>
                      <button class="btn-stop-cancel" @click=${() => { this._stopConfirm = false; }}>Cancel</button>
                    ` : html`
                      <button class="btn-stop-sampling" @click=${() => { this._stopConfirm = true; }}>
                        Stop prematurely
                      </button>
                    `}
                  </div>
                ` : html`
                  <p class="sampling-idle-msg">No active sampling session.</p>
                `}
              </div>
            `;
          })() : ''}

          <!-- ── Environment card ── -->
          <div class="card">
            <div class="card-label">Environment</div>
            ${s ? html`
              <div class="stats-row">
                <div class="stat-cell">
                  <span class="stat-label">Temperature</span>
                  <span class="stat-value" style="color:#f97316">${this._fmt(s.temperature, 1, '°C')}</span>
                  <canvas id="spark-temperature" class="spark"></canvas>
                </div>
                <div class="stat-cell">
                  <span class="stat-label">Humidity</span>
                  <span class="stat-value" style="color:#06b6d4">${this._fmt(s.humidity, 1, '%RH')}</span>
                  <canvas id="spark-humidity" class="spark"></canvas>
                </div>
                <div class="stat-cell">
                  <span class="stat-label">Pressure</span>
                  <span class="stat-value" style="color:#6366f1">${this._fmt(s.pressure, 0, 'Pa')}</span>
                  <canvas id="spark-pressure" class="spark"></canvas>
                </div>
              </div>
            ` : html`<p class="waiting-msg">—</p>`}
          </div>

          <!-- ── Power card ── -->
          <div class="card">
            <div class="card-label">Power</div>
            ${s ? html`
              <div class="battery-bar-track">
                <div class="battery-bar-fill"
                  style="width:${s.soc}%;background:${this._socColor(s.soc)};"></div>
              </div>
              <div class="battery-labels">
                <span class="battery-pct" style="color:${this._socColor(s.soc)}">${s.soc.toFixed(0)}%</span>
                <span class="battery-tte">${this._fmt(s.tte, 1, 'h')} remaining</span>
              </div>
              <div class="stats-row">
                <div class="stat-cell">
                  <span class="stat-label">Voltage</span>
                  <span class="stat-value" style="color:#a78bfa">${this._fmt(s.voltage, 2, 'V')}</span>
                  <canvas id="spark-voltage" class="spark"></canvas>
                </div>
                <div class="stat-cell">
                  <span class="stat-label">Current</span>
                  <span class="stat-value" style="color:#64748b">${this._fmt(s.current, 3, 'A')}</span>
                  <canvas id="spark-current" class="spark"></canvas>
                </div>
                <div class="stat-cell">
                  <span class="stat-label">Power</span>
                  <span class="stat-value" style="color:#f97316">${this._fmt(s.power, 2, 'W')}</span>
                  <canvas id="spark-power" class="spark"></canvas>
                </div>
              </div>
            ` : html`<p class="waiting-msg">—</p>`}
          </div>

          <!-- ── System log ── -->
          <div class="card">
            <div class="card-header-row">
              <span class="card-label" style="margin:0">System Log</span>
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
