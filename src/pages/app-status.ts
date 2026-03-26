import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import { bleService, ConnStatus, LiveState } from '../ble-service';

interface HistPoint {
  ts: number;  // epoch ms
  soc: number; voltage: number; power: number;
  temperature: number; humidity: number;
  flowrate: number; flowrateSP: number;
  fanRpm: number;
}

// Keep up to 10 minutes of points; charts show a fixed 5-minute window
const MAX_HIST   = 600;
const WINDOW_MS  = 5 * 60 * 1000;

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
      const pt: HistPoint = {
        ts: Date.now(),
        soc: s.soc ?? 0, voltage: s.voltage ?? 0, power: s.power ?? 0,
        temperature: s.temperature ?? 0, humidity: s.humidity ?? 0,
        flowrate: s.flowrate ?? 0, flowrateSP: s.flowrateSP ?? 0,
        fanRpm: s.fanRpm ?? 0,
      };
      this._hist = [...this._hist.slice(-(MAX_HIST - 1)), pt];
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
    this._drawCharts();
  }

  /* ── Chart drawing ─────────────────────────────────────────────────────── */
  private _drawCharts() {
    const now = Date.now();
    const pts = this._hist.filter(p => p.ts >= now - WINDOW_MS);
    if (pts.length < 1) return;

    // Flow: both series share one axis, floor at 0
    this._drawChart('chart-flow', pts, [
      { key: 'flowrate',   color: '#3b82f6', domainMin: 0 },
      { key: 'flowrateSP', color: '#f59e0b', dashed: true, domainMin: 0 },
    ]);
    // Battery: SoC on main axis (0-100), voltage normalized separately
    this._drawChart('chart-battery', pts, [
      { key: 'soc',     color: '#22c55e', domainMin: 0, domainMax: 100 },
      { key: 'voltage', color: '#a78bfa', normalize: true },
    ]);
    // Environment: both normalized to their own ranges
    this._drawChart('chart-env', pts, [
      { key: 'temperature', color: '#f97316', normalize: true },
      { key: 'humidity',    color: '#06b6d4', normalize: true, domainMin: 0, domainMax: 100 },
    ]);
  }

  private _drawChart(
    id: string,
    pts: HistPoint[],
    series: Array<{
      key: keyof Omit<HistPoint,'ts'>;
      color: string;
      dashed?: boolean;
      normalize?: boolean;
      domainMin?: number;
      domainMax?: number;
    }>
  ) {
    const canvas = this.shadowRoot?.querySelector<HTMLCanvasElement>(`#${id}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr  = window.devicePixelRatio || 1;
    const rect  = canvas.getBoundingClientRect();
    if (!rect.width) return;
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width, H = rect.height;
    const PL = 46, PR = 12, PT = 10, PB = 24;
    const cW = W - PL - PR, cH = H - PT - PB;

    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, W, H);

    // Fixed time window: windowEnd = now, windowStart = now - WINDOW_MS
    const windowEnd   = Date.now();
    const windowStart = windowEnd - WINDOW_MS;

    // Horizontal grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = PT + cH * i / 4;
      ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(W - PR, y); ctx.stroke();
    }

    // Vertical time tick marks (every minute)
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.fillStyle = '#3f3f46';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    for (let sec = 0; sec <= WINDOW_MS / 1000; sec += 60) {
      const x = PL + cW * sec / (WINDOW_MS / 1000);
      ctx.beginPath(); ctx.moveTo(x, PT); ctx.lineTo(x, PT + cH); ctx.stroke();
      if (sec > 0) {
        ctx.fillText(`-${(WINDOW_MS / 1000 - sec) / 60}m`, x, PT + cH + PB - 6);
      }
    }
    ctx.fillText('now', W - PR, PT + cH + PB - 6);

    // Global min/max from non-normalized series, with smart padding
    let gMin = Infinity, gMax = -Infinity;
    let gDomainMin = Infinity, gDomainMax = -Infinity;
    for (const s of series) {
      if (s.normalize) continue;
      if (s.domainMin !== undefined) gDomainMin = Math.min(gDomainMin, s.domainMin);
      if (s.domainMax !== undefined) gDomainMax = Math.max(gDomainMax, s.domainMax);
      for (const p of pts) {
        const v = p[s.key] as number;
        if (isFinite(v)) { gMin = Math.min(gMin, v); gMax = Math.max(gMax, v); }
      }
    }
    if (!isFinite(gMin)) { gMin = 0; gMax = 1; }
    if (gMin === gMax)   { gMin -= 0.5; gMax += 0.5; }
    // Add 8% padding on each side, then apply domain clamps
    const pad = Math.max((gMax - gMin) * 0.08, 0.05);
    gMin = isFinite(gDomainMin) ? Math.max(gDomainMin, gMin - pad) : gMin - pad;
    gMax = isFinite(gDomainMax) ? Math.min(gDomainMax, gMax + pad) : gMax + pad;

    // Y-axis labels
    ctx.fillStyle = '#52525b';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = gMax - (gMax - gMin) * i / 4;
      ctx.fillText(val.toFixed(1), PL - 4, PT + cH * i / 4 + 3.5);
    }

    const tsToX = (ts: number) => PL + cW * (ts - windowStart) / WINDOW_MS;

    for (const s of series) {
      let sMin = gMin, sMax = gMax;
      if (s.normalize) {
        sMin = Infinity; sMax = -Infinity;
        for (const p of pts) {
          const v = p[s.key] as number;
          if (isFinite(v)) { sMin = Math.min(sMin, v); sMax = Math.max(sMax, v); }
        }
        if (!isFinite(sMin)) continue;
        if (sMin === sMax) { sMin -= 0.5; sMax += 0.5; }
        const sPad = Math.max((sMax - sMin) * 0.08, 0.05);
        sMin = s.domainMin !== undefined ? Math.max(s.domainMin, sMin - sPad) : sMin - sPad;
        sMax = s.domainMax !== undefined ? Math.min(s.domainMax, sMax + sPad) : sMax + sPad;
      }

      const coords: [number, number][] = pts
        .map(p => {
          const v = p[s.key] as number;
          return [tsToX(p.ts), PT + cH * (1 - (v - sMin) / (sMax - sMin))] as [number, number];
        })
        .filter(([x]) => x >= PL - 2 && x <= W - PR + 2);

      if (coords.length < 1) continue;

      // Gradient fill
      const grad = ctx.createLinearGradient(0, PT, 0, PT + cH);
      grad.addColorStop(0, s.color + '22');
      grad.addColorStop(1, s.color + '00');
      ctx.beginPath();
      ctx.moveTo(coords[0][0], PT + cH);
      for (const [x, y] of coords) ctx.lineTo(x, y);
      ctx.lineTo(coords[coords.length - 1][0], PT + cH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Line
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.setLineDash(s.dashed ? [5, 3] : []);
      ctx.beginPath();
      ctx.moveTo(coords[0][0], coords[0][1]);
      for (let i = 1; i < coords.length; i++) ctx.lineTo(coords[i][0], coords[i][1]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /* ── Helpers ─────────────────────────────────────────────────────────────*/
  private _fmt(v: number | undefined, dec: number, unit: string) {
    if (v == null) return '—';
    return `${v.toFixed(dec)}${unit ? '\u202f' + unit : ''}`;
  }

  private _samplingBadge(s: string) {
    if (s === 'running') return { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', border: 'rgba(34,197,94,0.3)' };
    if (s === 'paused')  return { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' };
    if (s === 'waiting') return { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: 'rgba(59,130,246,0.3)' };
    return { bg: 'rgba(113,113,122,0.12)', color: '#71717a', border: 'rgba(113,113,122,0.3)' };
  }

  /* ── Styles ─────────────────────────────────────────────────────────────*/
  static styles = css`
    :host {
      --bg:        #09090b;
      --card:      #09090b;
      --border:    #27272a;
      --fg:        #fafafa;
      --muted-fg:  #71717a;
      --secondary: #27272a;
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
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px; height: 32px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: transparent;
      color: var(--muted-fg);
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
      text-decoration: none;
      font-size: 1rem;
      flex-shrink: 0;
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

    /* ── Alert ── */
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

    /* ── Card ── */
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

    /* ── Sampling badge ── */
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

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

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
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 3px;
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
      font-size: 1.05rem;
      font-weight: 600;
      color: var(--fg);
      letter-spacing: -0.01em;
    }

    .stat-value.dim { color: #52525b; }

    .ts-line {
      font-family: var(--mono);
      font-size: 0.65rem;
      color: var(--muted-fg);
      margin-top: 10px;
    }

    /* ── Charts ── */
    .chart-section {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    canvas {
      width: 100%;
      height: 160px;
      border-radius: 4px;
      display: block;
    }

    .chart-legend {
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
      margin-top: 6px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: var(--mono);
      font-size: 0.65rem;
      color: var(--muted-fg);
    }

    .legend-line {
      width: 16px; height: 2px;
      border-radius: 1px;
      flex-shrink: 0;
    }

    .legend-line.dashed {
      background: none;
      border-top: 2px dashed currentColor;
    }

    .no-data {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--muted-fg);
      text-align: center;
      padding: 32px 0;
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

    .waiting-msg {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--muted-fg);
      padding: 12px 0;
    }

    @media (max-width: 480px) {
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
      canvas { height: 130px; }
    }
  `;

  render() {
    const connected = this.connStatus === 'connected';
    const s = this.liveState;
    const badge = s ? this._samplingBadge(s.samplingState) : null;

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

          <!-- Live state -->
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
                </div>
                <div class="stat-cell">
                  <span class="stat-label">Voltage</span>
                  <span class="stat-value">${this._fmt(s.voltage, 2, 'V')}</span>
                </div>
                <div class="stat-cell">
                  <span class="stat-label">Current</span>
                  <span class="stat-value">${this._fmt(s.current, 3, 'A')}</span>
                </div>
                <div class="stat-cell">
                  <span class="stat-label">Power</span>
                  <span class="stat-value">${this._fmt(s.power, 2, 'W')}</span>
                </div>
                <div class="stat-cell">
                  <span class="stat-label">TTE</span>
                  <span class="stat-value">${this._fmt(s.tte, 2, 'h')}</span>
                </div>
                <div class="stat-cell">
                  <span class="stat-label">Fan RPM</span>
                  <span class="stat-value">${this._fmt(s.fanRpm, 0, '')}</span>
                </div>
                <div class="stat-cell">
                  <span class="stat-label">Temp</span>
                  <span class="stat-value">${this._fmt(s.temperature, 1, '°C')}</span>
                </div>
                <div class="stat-cell">
                  <span class="stat-label">Humidity</span>
                  <span class="stat-value">${this._fmt(s.humidity, 1, '%RH')}</span>
                </div>
                <div class="stat-cell">
                  <span class="stat-label">Pressure</span>
                  <span class="stat-value">${this._fmt(s.pressure, 0, 'Pa')}</span>
                </div>
                <div class="stat-cell">
                  <span class="stat-label">Flowrate</span>
                  <span class="stat-value">${this._fmt(s.flowrate, 4, 'L/s')}</span>
                </div>
                <div class="stat-cell">
                  <span class="stat-label">Flow SP</span>
                  <span class="stat-value">${this._fmt(s.flowrateSP, 4, 'L/s')}</span>
                </div>
                <div class="stat-cell">
                  <span class="stat-label">Servo</span>
                  <span class="stat-value">${this._fmt(s.servoMm, 2, 'mm')}</span>
                </div>
              </div>
              <div class="ts-line">${s.ts}</div>
            ` : html`
              <p class="waiting-msg">Waiting for state broadcast…</p>
            `}
          </div>

          <!-- Charts -->
          <div class="chart-section">

            <!-- Flow control -->
            <div class="card">
              <div class="card-header">
                <span class="card-title">Flow Control</span>
              </div>
              ${this._hist.length >= 2 ? html`
                <canvas id="chart-flow"></canvas>
                <div class="chart-legend">
                  <div class="legend-item">
                    <span class="legend-line" style="background:#3b82f6;"></span>
                    Actual
                  </div>
                  <div class="legend-item">
                    <span class="legend-line dashed" style="color:#f59e0b;border-color:#f59e0b;"></span>
                    Setpoint
                  </div>
                </div>
              ` : html`<div class="no-data">Collecting data…</div>`}
            </div>

            <!-- Battery -->
            <div class="card">
              <div class="card-header">
                <span class="card-title">Battery</span>
              </div>
              ${this._hist.length >= 2 ? html`
                <canvas id="chart-battery"></canvas>
                <div class="chart-legend">
                  <div class="legend-item">
                    <span class="legend-line" style="background:#22c55e;"></span>
                    SoC %
                  </div>
                  <div class="legend-item">
                    <span class="legend-line" style="background:#a78bfa;"></span>
                    Voltage (normalized)
                  </div>
                </div>
              ` : html`<div class="no-data">Collecting data…</div>`}
            </div>

            <!-- Environment -->
            <div class="card">
              <div class="card-header">
                <span class="card-title">Environment</span>
              </div>
              ${this._hist.length >= 2 ? html`
                <canvas id="chart-env"></canvas>
                <div class="chart-legend">
                  <div class="legend-item">
                    <span class="legend-line" style="background:#f97316;"></span>
                    Temp °C
                  </div>
                  <div class="legend-item">
                    <span class="legend-line" style="background:#06b6d4;"></span>
                    Humidity %
                  </div>
                </div>
              ` : html`<div class="no-data">Collecting data…</div>`}
            </div>

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
