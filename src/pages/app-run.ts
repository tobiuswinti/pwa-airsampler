import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import { DeviceRun, getDeviceRuns, deleteDeviceRun } from '../device-log-store';

// ── Chart groups ───────────────────────────────────────────────────────────

interface Series {
  field:      string;
  label:      string;
  color:      string;
  dashed?:    boolean;
  normalize?: boolean;
  domainMin?: number;
  domainMax?: number;
}

interface ChartGroup {
  id:     string;
  title:  string;
  series: Series[];
}

const CHART_GROUPS: ChartGroup[] = [
  {
    id: 'flow', title: 'Flow',
    series: [
      { field: 'flowrate',   label: 'Actual',   color: '#3b82f6', domainMin: 0 },
      { field: 'flowrateSP', label: 'Setpoint', color: '#f59e0b', dashed: true, domainMin: 0 },
    ],
  },
  {
    id: 'battery', title: 'Battery',
    series: [
      { field: 'soc',     label: 'SoC',     color: '#22c55e', domainMin: 0, domainMax: 100 },
      { field: 'voltage', label: 'Voltage', color: '#a78bfa', normalize: true },
      { field: 'current', label: 'Current', color: '#94a3b8', normalize: true },
    ],
  },
  {
    id: 'env', title: 'Environment',
    series: [
      { field: 'temperature', label: 'Temp',     color: '#f97316' },
      { field: 'humidity',    label: 'Humidity', color: '#06b6d4', normalize: true, domainMin: 0, domainMax: 100 },
      { field: 'pressure',    label: 'Pressure', color: '#6366f1', normalize: true },
    ],
  },
  {
    id: 'mechanical', title: 'Mechanical',
    series: [
      { field: 'fanRpm',   label: 'Fan RPM', color: '#71717a' },
      { field: 'servoMm',  label: 'Servo',   color: '#84cc16', normalize: true },
    ],
  },
];

// Fields shown as key-metrics pills (in order)
const KEY_FIELDS = ['flowrate', 'soc', 'temperature', 'humidity', 'pressure', 'voltage', 'fanRpm'];

// ── Helpers ────────────────────────────────────────────────────────────────

const FIELD_LABEL: Record<string, string> = {
  flowrate: 'Flow', flowrateSP: 'Setpoint', soc: 'SoC', voltage: 'Voltage',
  current: 'Current', power: 'Power', tte: 'Runtime', temperature: 'Temp',
  humidity: 'Humidity', pressure: 'Pressure', fanRpm: 'Fan', servoMm: 'Servo',
};

const FIELD_UNIT: Record<string, string> = {
  flowrate: 'L/s', flowrateSP: 'L/s', soc: '%', voltage: 'V',
  current: 'A', power: 'W', tte: 'h', temperature: '°C',
  humidity: '%RH', pressure: 'Pa', fanRpm: 'rpm', servoMm: 'mm',
};

const FIELD_DEC: Record<string, number> = {
  flowrate: 3, flowrateSP: 3, soc: 1, voltage: 2, current: 3, power: 2,
  tte: 2, temperature: 1, humidity: 1, pressure: 0, fanRpm: 0, servoMm: 2,
};

const STATE_COLOR: Record<string, string> = {
  running: '#22c55e', paused: '#f59e0b', waiting: '#3b82f6', idle: '#52525b',
};

function fmtElapsed(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

function fmtDate(ms: number): string { return new Date(ms).toLocaleString(); }

function pickTickMs(dur: number): number {
  if (dur <=   5 * 60_000) return       30_000;
  if (dur <=  15 * 60_000) return       60_000;
  if (dur <=  60 * 60_000) return    5 * 60_000;
  if (dur <= 360 * 60_000) return   30 * 60_000;
  return 3_600_000;
}

function fmtTick(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h${m > 0 ? m + 'm' : ''}`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(ms / 1000)}s`;
}

function yFmt(v: number, range: number): string {
  if (range < 0.1)  return v.toFixed(4);
  if (range < 1)    return v.toFixed(3);
  if (range < 10)   return v.toFixed(2);
  if (range < 100)  return v.toFixed(1);
  return v.toFixed(0);
}

function lastVal(run: DeviceRun, field: string): number | null {
  const idx = run.fields.indexOf(field);
  if (idx < 0) return null;
  for (let i = run.rows.length - 1; i >= 0; i--) {
    const v = Number(run.rows[i][idx]);
    if (isFinite(v)) return v;
  }
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────

@customElement('app-run')
export class AppRun extends LitElement {

  @state() private run: DeviceRun | null = null;
  @state() private notFound = false;

  private _onHash = () => this._loadRun();

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('hashchange', this._onHash);
    this._loadRun();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('hashchange', this._onHash);
  }

  private _loadRun() {
    const match = window.location.hash.match(/^#run\/(\d+)$/);
    if (!match) { this.notFound = true; return; }
    const id  = Number(match[1]);
    const run = getDeviceRuns().find(r => r.id === id) ?? null;
    this.run      = run;
    this.notFound = !run;
    if (run) document.title = `AirSampler — ${run.meta?.tagId || `Run #${run.id}`}`;
  }

  updated() { if (this.run) this._drawAllCharts(); }

  // ── Duration ──────────────────────────────────────────────────────────

  private _duration(): number {
    const run   = this.run!;
    const tsIdx = run.fields.indexOf('timestamp');
    if (tsIdx < 0 || run.rows.length < 2) return (run.rows.length - 1) * run.meta.interval;
    return Number(run.rows[run.rows.length - 1][tsIdx]) - Number(run.rows[0][tsIdx]);
  }

  // ── Chart drawing ──────────────────────────────────────────────────────

  private _drawAllCharts() {
    const run   = this.run!;
    const tsIdx = run.fields.indexOf('timestamp');
    if (tsIdx < 0) return;

    // Multi-series grouped charts
    for (const group of CHART_GROUPS) {
      const resolved = group.series
        .map(s => ({ ...s, colIdx: run.fields.indexOf(s.field) }))
        .filter(s => s.colIdx >= 0);
      if (resolved.length === 0) continue;

      const pts = run.rows
        .map(row => ({ ts: Number(row[tsIdx]), vals: resolved.map(s => Number(row[s.colIdx])) }))
        .filter(p => isFinite(p.ts));
      if (pts.length < 2) continue;
      this._drawGroupChart(`chart-${group.id}`, pts, resolved);
    }

    // State timeline
    const stateIdx = run.fields.indexOf('samplingState');
    if (stateIdx >= 0) {
      const pts = run.rows
        .map(row => ({ ts: Number(row[tsIdx]), state: row[stateIdx] }))
        .filter(p => isFinite(p.ts));
      if (pts.length >= 2) this._drawStateChart('chart-states', pts);
    }
  }

  private _drawGroupChart(
    canvasId: string,
    pts: { ts: number; vals: number[] }[],
    series: Array<Series & { colIdx: number }>,
  ) {
    const canvas = this.shadowRoot?.querySelector<HTMLCanvasElement>(`#${canvasId}`);
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
    const PL = 48, PR = 12, PT = 8, PB = 22;
    const cW = W - PL - PR, cH = H - PT - PB;

    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, W, H);

    const tStart = pts[0].ts, tEnd = pts[pts.length - 1].ts;
    const dur    = Math.max(tEnd - tStart, 1);
    const tsToX  = (ts: number) => PL + cW * (ts - tStart) / dur;

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth   = 1;
    for (let i = 0; i <= 4; i++) {
      const y = PT + cH * i / 4;
      ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(W - PR, y); ctx.stroke();
    }

    // Y range from non-normalized series
    let gMin = Infinity, gMax = -Infinity;
    let gDomMin = Infinity, gDomMax = -Infinity;
    series.forEach((s, si) => {
      if (s.normalize) return;
      if (s.domainMin !== undefined) gDomMin = Math.min(gDomMin, s.domainMin);
      if (s.domainMax !== undefined) gDomMax = Math.max(gDomMax, s.domainMax);
      for (const p of pts) {
        const v = p.vals[si];
        if (isFinite(v)) { gMin = Math.min(gMin, v); gMax = Math.max(gMax, v); }
      }
    });
    if (!isFinite(gMin)) { gMin = 0; gMax = 1; }
    if (gMin === gMax)   { gMin -= 0.5; gMax += 0.5; }
    const gPad = Math.max((gMax - gMin) * 0.08, 0.05);
    gMin = isFinite(gDomMin) ? Math.max(gDomMin, gMin - gPad) : gMin - gPad;
    gMax = isFinite(gDomMax) ? Math.min(gDomMax, gMax + gPad) : gMax + gPad;
    const gRange = gMax - gMin;

    // Y labels
    ctx.fillStyle = '#52525b'; ctx.font = '9px monospace'; ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      ctx.fillText(yFmt(gMax - gRange * i / 4, gRange), PL - 4, PT + cH * i / 4 + 3.5);
    }

    // X ticks
    const tickMs = pickTickMs(dur);
    ctx.font = '8px monospace'; ctx.textAlign = 'center';
    for (let el = 0; el <= dur + tickMs * 0.01; el += tickMs) {
      const x = PL + cW * el / dur;
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, PT); ctx.lineTo(x, PT + cH); ctx.stroke();
      ctx.fillStyle = '#3f3f46';
      ctx.fillText(fmtTick(el), Math.min(x, W - PR), PT + cH + PB - 6);
    }

    // Draw series
    series.forEach((s, si) => {
      let sMin = gMin, sMax = gMax;
      if (s.normalize) {
        sMin = Infinity; sMax = -Infinity;
        for (const p of pts) { const v = p.vals[si]; if (isFinite(v)) { sMin = Math.min(sMin, v); sMax = Math.max(sMax, v); } }
        if (!isFinite(sMin)) return;
        if (sMin === sMax)   { sMin -= 0.5; sMax += 0.5; }
        const sPad = Math.max((sMax - sMin) * 0.08, 0.05);
        sMin = s.domainMin !== undefined ? Math.max(s.domainMin, sMin - sPad) : sMin - sPad;
        sMax = s.domainMax !== undefined ? Math.min(s.domainMax, sMax + sPad) : sMax + sPad;
      }

      const coords = pts.map(p => [
        tsToX(p.ts),
        PT + cH * (1 - (p.vals[si] - sMin) / (sMax - sMin)),
      ] as [number, number]);

      // Fill
      const grad = ctx.createLinearGradient(0, PT, 0, PT + cH);
      grad.addColorStop(0, s.color + (s.normalize ? '18' : '28'));
      grad.addColorStop(1, s.color + '00');
      ctx.beginPath();
      ctx.moveTo(coords[0][0], PT + cH);
      for (const [x, y] of coords) ctx.lineTo(x, y);
      ctx.lineTo(coords[coords.length - 1][0], PT + cH);
      ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();

      // Line
      ctx.strokeStyle = s.color; ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.setLineDash(s.dashed ? [5, 3] : []);
      ctx.beginPath(); ctx.moveTo(coords[0][0], coords[0][1]);
      for (let i = 1; i < coords.length; i++) ctx.lineTo(coords[i][0], coords[i][1]);
      ctx.stroke(); ctx.setLineDash([]);
    });
  }

  private _drawStateChart(canvasId: string, pts: { ts: number; state: string }[]) {
    const canvas = this.shadowRoot?.querySelector<HTMLCanvasElement>(`#${canvasId}`);
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
    const PL = 48, PR = 12, PT = 8, PB = 22;
    const cW = W - PL - PR, cH = H - PT - PB;

    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, W, H);

    const tStart = pts[0].ts, tEnd = pts[pts.length - 1].ts;
    const dur    = Math.max(tEnd - tStart, 1);
    const tsToX  = (ts: number) => PL + cW * (ts - tStart) / dur;

    for (let i = 0; i < pts.length; i++) {
      const x0    = tsToX(pts[i].ts);
      const x1    = i < pts.length - 1 ? tsToX(pts[i + 1].ts) : PL + cW;
      const color = STATE_COLOR[pts[i].state] ?? '#52525b';
      ctx.fillStyle = color + '2a'; ctx.fillRect(x0, PT, x1 - x0, cH);
      ctx.fillStyle = color + 'cc'; ctx.fillRect(x0, PT, x1 - x0, 2);
    }

    // X ticks
    const tickMs = pickTickMs(dur);
    ctx.font = '8px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#3f3f46';
    for (let el = 0; el <= dur + tickMs * 0.01; el += tickMs) {
      const x = PL + cW * el / dur;
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, PT); ctx.lineTo(x, PT + cH); ctx.stroke();
      ctx.fillStyle = '#3f3f46';
      ctx.fillText(fmtTick(el), Math.min(x, W - PR), PT + cH + PB - 6);
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────

  private _download() {
    const run   = this.run!;
    const lines = [run.fields.join(','), run.units.join(','), ...run.rows.map(r => r.join(','))];
    const blob  = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href = url; a.download = `run_${run.id}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  private _delete() {
    if (!this.run) return;
    deleteDeviceRun(this.run.id);
    window.location.hash = '#sync';
  }

  // ── Styles ────────────────────────────────────────────────────────────

  static styles = css`
    :host {
      --bg:       #09090b;
      --card:     #09090b;
      --border:   #27272a;
      --fg:       #fafafa;
      --muted-fg: #71717a;
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
      color: var(--fg);
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .header-actions { display: flex; gap: 8px; flex-shrink: 0; }

    .content {
      width: 100%;
      max-width: 680px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

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

    /* ── Key metrics strip ── */
    .metrics-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 1px;
      background: var(--border);
      border-radius: 6px;
      overflow: hidden;
    }

    .metric-cell {
      background: var(--card);
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 90px;
    }

    .metric-label {
      font-size: 0.62rem;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted-fg);
    }

    .metric-value {
      font-family: var(--mono);
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--fg);
    }

    /* ── Info rows ── */
    .info-rows {
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    .info-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
    }

    .info-row:last-child { border-bottom: none; }

    .info-label {
      font-size: 0.75rem;
      color: var(--muted-fg);
      min-width: 96px;
      flex-shrink: 0;
    }

    .info-value {
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--fg);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* ── Upload badge ── */
    .upload-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 0.7rem;
      font-family: var(--mono);
      padding: 2px 8px;
      border-radius: 4px;
    }

    .upload-badge.uploaded { color: #22c55e; background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); }
    .upload-badge.pending  { color: #71717a;  background: rgba(113,113,122,0.08); border: 1px solid #27272a; }

    /* ── Charts ── */
    canvas {
      width: 100%;
      height: 150px;
      border-radius: 4px;
      display: block;
    }

    canvas.state-canvas { height: 56px; }

    .chart-legend {
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
      margin-top: 8px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 5px;
      font-family: var(--mono);
      font-size: 0.65rem;
      color: var(--muted-fg);
    }

    .legend-swatch {
      width: 14px; height: 2px;
      border-radius: 1px;
      flex-shrink: 0;
    }

    .legend-swatch.dashed { background: none !important; border-top: 2px dashed currentColor; }

    .legend-dot {
      width: 8px; height: 8px;
      border-radius: 2px;
      flex-shrink: 0;
    }

    .no-data {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--muted-fg);
      text-align: center;
      padding: 20px 0;
    }

    /* ── Map ── */
    .map-frame {
      width: 100%;
      height: 200px;
      border: 0;
      border-radius: 6px;
      display: block;
      filter: brightness(0.85) saturate(0.85);
    }

    /* ── Buttons ── */
    .btn-sm {
      font-family: var(--mono);
      font-size: 0.68rem;
      padding: 5px 12px;
      border-radius: 5px;
      cursor: pointer;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted-fg);
      transition: all 0.12s;
      white-space: nowrap;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
    }

    .btn-sm:hover         { border-color: #52525b; color: var(--fg); }
    .btn-sm.danger:hover  { border-color: #ef4444; color: #f87171; }

    .not-found {
      font-family: var(--mono);
      font-size: 0.85rem;
      color: var(--muted-fg);
      text-align: center;
      padding: 60px 20px;
    }

    @media (max-width: 480px) {
      canvas { height: 120px; }
      .metric-cell { min-width: 70px; }
    }
  `;

  // ── Render ────────────────────────────────────────────────────────────

  render() {
    if (this.notFound) return html`
      <main>
        <div class="page-header">
          <a class="back-btn" href="${resolveRouterPath('sync')}">←</a>
          <span class="page-title">Run not found</span>
        </div>
        <p class="not-found">Run not found or deleted.</p>
      </main>
    `;

    const run = this.run;
    if (!run) return html``;

    const runName    = run.meta?.tagId || `Run #${run.id}`;
    const duration   = this._duration();
    const lat        = run.meta.lat ? parseFloat(run.meta.lat) : null;
    const lon        = run.meta.lon ? parseFloat(run.meta.lon) : null;
    const hasLocation = lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0);

    // Key metrics: last value of each present field
    const keyMetrics = KEY_FIELDS
      .filter(f => run.fields.includes(f))
      .map(f => ({ field: f, val: lastVal(run, f) }))
      .filter(m => m.val !== null);

    // Chart groups that have at least one present field
    const activeGroups = CHART_GROUPS.filter(g =>
      g.series.some(s => run.fields.includes(s.field))
    );

    const hasStates   = run.fields.includes('samplingState');
    const stateIdx    = run.fields.indexOf('samplingState');
    const uniqueStates = stateIdx >= 0
      ? [...new Set(run.rows.map(r => r[stateIdx]))]
      : [];

    return html`
      <main>
        <div class="page-header">
          <a class="back-btn" href="${resolveRouterPath('sync')}">←</a>
          <span class="page-title">${runName}</span>
          <div class="header-actions">
            <button class="btn-sm" @click=${this._download}>CSV</button>
            <button class="btn-sm danger" @click=${this._delete}>Delete</button>
          </div>
        </div>

        <div class="content">

          <!-- Key metrics -->
          ${keyMetrics.length > 0 ? html`
            <div class="metrics-strip">
              ${keyMetrics.map(({ field, val }) => html`
                <div class="metric-cell">
                  <span class="metric-label">${FIELD_LABEL[field] ?? field}</span>
                  <span class="metric-value">${val!.toFixed(FIELD_DEC[field] ?? 2)} ${FIELD_UNIT[field] ?? ''}</span>
                </div>
              `)}
            </div>
          ` : ''}

          <!-- Run info -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">Run Info</span>
              ${run.firebaseId
                ? html`<span class="upload-badge uploaded">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
                    Uploaded
                  </span>`
                : html`<span class="upload-badge pending">Pending upload</span>`}
            </div>
            <div class="info-rows">
              <div class="info-row">
                <span class="info-label">Start</span>
                <span class="info-value">${fmtDate(run.meta.startTime)}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Duration</span>
                <span class="info-value">${fmtElapsed(duration)}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Interval</span>
                <span class="info-value">${run.meta.interval} ms</span>
              </div>
              ${run.meta.tagId ? html`
                <div class="info-row">
                  <span class="info-label">Sample ID</span>
                  <span class="info-value">${run.meta.tagId}</span>
                </div>` : ''}
              ${hasLocation ? html`
                <div class="info-row">
                  <span class="info-label">Location</span>
                  <span class="info-value">${lat!.toFixed(5)}, ${lon!.toFixed(5)}</span>
                </div>` : ''}
            </div>
          </div>

          <!-- Location map -->
          ${hasLocation ? html`
            <div class="card">
              <div class="card-header"><span class="card-title">Location</span></div>
              <iframe class="map-frame"
                src="https://www.openstreetmap.org/export/embed.html?bbox=${lon! - 0.005},${lat! - 0.005},${lon! + 0.005},${lat! + 0.005}&layer=mapnik&marker=${lat},${lon}"
                loading="lazy"></iframe>
            </div>
          ` : ''}

          <!-- Sampling state timeline -->
          ${hasStates ? html`
            <div class="card">
              <div class="card-header"><span class="card-title">Sampling State</span></div>
              <canvas id="chart-states" class="state-canvas"></canvas>
              <div class="chart-legend" style="margin-top:6px">
                ${uniqueStates.map(s => html`
                  <div class="legend-item">
                    <span class="legend-dot" style="background:${STATE_COLOR[s] ?? '#52525b'}"></span>
                    ${s}
                  </div>
                `)}
              </div>
            </div>
          ` : ''}

          <!-- Multi-series charts -->
          ${activeGroups.map(group => {
            const presentSeries = group.series.filter(s => run.fields.includes(s.field));
            return html`
              <div class="card">
                <div class="card-header">
                  <span class="card-title">${group.title}</span>
                </div>
                ${run.rows.length >= 2 ? html`
                  <canvas id="chart-${group.id}"></canvas>
                  <div class="chart-legend">
                    ${presentSeries.map(s => html`
                      <div class="legend-item">
                        <span class="legend-swatch ${s.dashed ? 'dashed' : ''}"
                          style="${s.dashed ? `color:${s.color}` : `background:${s.color}`}"></span>
                        ${s.label}${s.normalize ? ' ·norm' : ''}
                      </div>
                    `)}
                  </div>
                ` : html`<div class="no-data">Not enough data.</div>`}
              </div>
            `;
          })}

        </div>
      </main>
    `;
  }
}
