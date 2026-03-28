import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { DeviceRun, getDeviceRuns, deleteDeviceRun } from '../device-log-store';

// ── Interfaces ────────────────────────────────────────────────────────────

interface Series {
  field: string; label: string; color: string; unit: string;
  dashed?: boolean; domainMin?: number; domainMax?: number;
  convert?: (v: number) => number;
}
interface ChartGroup { id: string; title: string; series: Series[]; }

interface ComputedSeries {
  field: string; label: string; color: string; unit: string;
  vals: number[];
  sMin: number; sMax: number;
}
interface ComputedChart {
  timestamps: number[];
  series: ComputedSeries[];
  tStart: number; dur: number;
  PL: number; PR: number; PT: number; PB: number;
}

// ── Chart groups ──────────────────────────────────────────────────────────

const CHART_GROUPS: ChartGroup[] = [
  {
    id: 'env', title: 'Environment',
    series: [
      { field: 'temperature', label: 'Temp',     color: '#f97316', unit: '°C' },
      { field: 'humidity',    label: 'Humidity', color: '#06b6d4', unit: '%RH', domainMin: 0, domainMax: 100 },
      { field: 'pressure',    label: 'Pressure', color: '#6366f1', unit: 'bar',
        convert: (v: number) => v / 100_000 },
    ],
  },
];

const STATE_COLOR: Record<string, string> = {
  IDLE:     '#52525b',
  OPENING:  '#f59e0b',
  WAITING:  '#3b82f6',
  RUNNING:  '#22c55e',
  PAUSED:   '#f97316',
  RESUMING: '#8b5cf6',
  CLOSING:  '#eab308',
};

/** Maps numeric samplingState enum values to names (matches device SamplingState enum). */
const STATE_NAMES: Record<string, string> = {
  '0': 'IDLE', '1': 'RUNNING', '2': 'PAUSED',
  '3': 'WAITING', '4': 'OPENING', '5': 'RESUMING', '6': 'CLOSING',
};

function resolveStateName(raw: string): string {
  return STATE_NAMES[raw] ?? raw.toUpperCase();
}

const STATE_PALETTE = ['#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444'];

function resolveStateColor(state: string, uniqueStates: string[]): string {
  if (STATE_COLOR[state]) return STATE_COLOR[state];
  const idx = uniqueStates.indexOf(state);
  return STATE_PALETTE[idx % STATE_PALETTE.length];
}

/** Normalize a timestamp to milliseconds. Device reports Unix seconds (~1.7e9). */
function toMs(ts: number): number {
  return ts < 2e10 ? ts * 1000 : ts;
}

// ── Helper functions ──────────────────────────────────────────────────────

function minVal(run: DeviceRun, field: string): number | null {
  const idx = run.fields.indexOf(field);
  if (idx < 0) return null;
  let min = Infinity;
  for (const row of run.rows) { const v = Number(row[idx]); if (isFinite(v)) min = Math.min(min, v); }
  return isFinite(min) ? min : null;
}

function maxVal(run: DeviceRun, field: string): number | null {
  const idx = run.fields.indexOf(field);
  if (idx < 0) return null;
  let max = -Infinity;
  for (const row of run.rows) { const v = Number(row[idx]); if (isFinite(v)) max = Math.max(max, v); }
  return isFinite(max) ? max : null;
}

function avgVal(run: DeviceRun, field: string): number | null {
  const idx = run.fields.indexOf(field);
  if (idx < 0) return null;
  let sum = 0, count = 0;
  for (const row of run.rows) { const v = Number(row[idx]); if (isFinite(v)) { sum += v; count++; } }
  return count > 0 ? sum / count : null;
}

function lastVal(run: DeviceRun, field: string): number | null {
  const idx = run.fields.indexOf(field);
  if (idx < 0) return null;
  for (let i = run.rows.length - 1; i >= 0; i--) {
    const v = Number(run.rows[i][idx]); if (isFinite(v)) return v;
  }
  return null;
}

function firstVal(run: DeviceRun, field: string): number | null {
  const idx = run.fields.indexOf(field);
  if (idx < 0) return null;
  for (let i = 0; i < run.rows.length; i++) {
    const v = Number(run.rows[i][idx]); if (isFinite(v)) return v;
  }
  return null;
}

function fmtElapsed(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

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
  if (range < 0.001) return v.toFixed(5);
  if (range < 0.01)  return v.toFixed(4);
  if (range < 0.1)   return v.toFixed(3);
  if (range < 1)     return v.toFixed(2);
  if (range < 10)    return v.toFixed(1);
  return v.toFixed(0);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ── Component ─────────────────────────────────────────────────────────────

@customElement('app-run')
export class AppRun extends LitElement {

  @state() private run:      DeviceRun | null = null;
  @state() private loading   = false;
  @state() private error     = '';
  @state() private isCloud   = false;

  private _onHash = () => this._load();
  private _charts = new Map<string, ComputedChart>();
  private _boundListeners = new Set<string>();
  private _statePts: { ts: number; state: string }[] = [];
  private _stateListenerBound = false;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('hashchange', this._onHash);
    this._load();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('hashchange', this._onHash);
  }

  private async _load() {
    const hash = window.location.hash;

    const localMatch = hash.match(/^#run\/(\d+)$/);
    const cloudMatch = hash.match(/^#cloud-run\/(.+)$/);

    if (localMatch) {
      this.isCloud = false;
      this.loading = false;
      this.error   = '';
      const id  = Number(localMatch[1]);
      const run = getDeviceRuns().find(r => r.id === id) ?? null;
      this.run  = run;
      if (!run) this.error = 'Run not found or deleted.';
      else document.title = `AirSampler — ${run.meta?.tagId || `Run #${run.id}`}`;
      return;
    }

    if (cloudMatch) {
      this.isCloud = true;
      this.loading = true;
      this.error   = '';
      this.run     = null;
      const docId  = cloudMatch[1];

      try {
        const snap = await getDoc(doc(db, 'device_runs', docId));
        if (!snap.exists()) {
          this.error   = 'Run not found in cloud.';
          this.loading = false;
          return;
        }
        const d          = snap.data();
        const uploadedAt = d['uploadedAt'] instanceof Timestamp
          ? d['uploadedAt'].toMillis()
          : Number(d['uploadedAt'] ?? 0);
        const meta       = d['meta'] ?? {};
        const csvRows: string[] = d['csvRows'] ?? [];
        const rows = csvRows.map((r: string) => r.split(','));

        this.run = {
          id:             Number(d['deviceRunId'] ?? 0),
          downloadedAt:   Number(d['downloadedAt'] ?? 0),
          fields:         d['fields']  ?? [],
          units:          d['units']   ?? [],
          meta: {
            startTime:  Number(meta['startTime'] ?? d['startTime'] ?? 0),
            interval:   Number(meta['interval']  ?? 1000),
            tagId:      meta['tagId']      ?? d['tagId'] ?? '',
            lat:        meta['lat']        ?? '',
            lon:        meta['lon']        ?? '',
            states:     meta['states']     ?? '',
            deviceName: meta['deviceName'] ?? d['deviceName'] ?? '',
          },
          rows,
          firebaseId:      docId,
          cloudUploadedAt: uploadedAt,
        };
        document.title = `AirSampler — ${this.run.meta.tagId || `Run #${this.run.id}`}`;
      } catch (err: unknown) {
        this.error = (err as Error)?.message ?? 'Failed to load run from cloud.';
      } finally {
        this.loading = false;
      }
      return;
    }

    this.error = 'Invalid URL.';
    this.loading = false;
  }

  updated() {
    if (this.run) {
      this._buildAndDrawCharts();
      this._bindHoverListeners();
      this._drawEnvSparks();
    }
  }

  private _drawEnvSparks() {
    const run = this.run!;
    const sparks: [string, string, string][] = [
      ['spark-temperature', 'temperature', '#f97316'],
      ['spark-humidity',    'humidity',    '#06b6d4'],
      ['spark-pressure',    'pressure',    '#6366f1'],
    ];
    for (const [id, field, color] of sparks) {
      const idx = run.fields.indexOf(field);
      if (idx < 0) continue;
      const vals: number[] = [];
      for (const row of run.rows) {
        const v = Number(row[idx]);
        if (isFinite(v)) vals.push(v);
      }
      if (vals.length >= 2) this._drawSpark(id, vals, color);
    }
  }

  private _drawSpark(id: string, vals: number[], color: string) {
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
    let min = Infinity, max = -Infinity;
    for (const v of vals) { min = Math.min(min, v); max = Math.max(max, v); }
    if (min === max) { min -= 0.5; max += 0.5; }
    const pad = (max - min) * 0.15;
    min -= pad; max += pad;
    const xStep = W / Math.max(vals.length - 1, 1);
    const toY   = (v: number) => H * (1 - (v - min) / (max - min));
    const grad  = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, color + '28'); grad.addColorStop(1, color + '00');
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let i = 0; i < vals.length; i++) ctx.lineTo(i * xStep, toY(vals[i]));
    ctx.lineTo((vals.length - 1) * xStep, H); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, toY(vals[0]));
    for (let i = 1; i < vals.length; i++) ctx.lineTo(i * xStep, toY(vals[i]));
    ctx.stroke();
  }

  private _duration(): number {
    const run = this.run!;
    // elapsedS column (device-reported seconds) is the most accurate source
    const elIdx = run.fields.indexOf('elapsedS');
    if (elIdx >= 0) {
      for (let i = run.rows.length - 1; i >= 0; i--) {
        const v = Number(run.rows[i][elIdx]);
        if (isFinite(v) && v > 0) return v * 1000; // s → ms
      }
    }
    // Fallback: timestamp column delta (only reliable if timestamps are in ms)
    const tsIdx = run.fields.indexOf('timestamp');
    if (tsIdx >= 0 && run.rows.length >= 2) {
      const d = Number(run.rows[run.rows.length - 1][tsIdx]) - Number(run.rows[0][tsIdx]);
      if (d > 5000) return d; // sanity: must be > 5 s to avoid the interval-unit bug
    }
    // Last resort: row count × interval (interval stored in seconds by device)
    return (run.rows.length - 1) * run.meta.interval * 1000;
  }

  // ── Chart building ────────────────────────────────────────────────────

  private _buildAndDrawCharts() {
    this._charts.clear();
    const run   = this.run!;
    const tsIdx = run.fields.indexOf('timestamp');
    if (tsIdx < 0) return;

    for (const group of CHART_GROUPS) {
      const activeSeries = group.series.filter(s => run.fields.indexOf(s.field) >= 0);
      if (activeSeries.length === 0) continue;

      const timestamps: number[] = [];
      for (const row of run.rows) {
        const t = Number(row[tsIdx]);
        if (isFinite(t)) timestamps.push(toMs(t));
      }
      if (timestamps.length < 2) continue;

      const tStart = timestamps[0];
      const tEnd   = timestamps[timestamps.length - 1];
      const dur    = Math.max(tEnd - tStart, 1);

      const numRight = Math.min(activeSeries.length - 1, 2);
      const PL = 48, PR = 10 + numRight * 52, PT = 10, PB = 24;

      const computedSeries: ComputedSeries[] = activeSeries.map(s => {
        const colIdx = run.fields.indexOf(s.field);
        const vals: number[] = [];
        for (const row of run.rows) {
          const t = Number(row[tsIdx]);
          if (!isFinite(t)) continue;
          const raw = Number(row[colIdx]);
          vals.push(isFinite(raw) ? (s.convert ? s.convert(raw) : raw) : NaN);
        }
        let sMin = Infinity, sMax = -Infinity;
        for (const v of vals) { if (isFinite(v)) { sMin = Math.min(sMin, v); sMax = Math.max(sMax, v); } }
        if (!isFinite(sMin)) { sMin = 0; sMax = 1; }
        if (sMin === sMax)   { sMin -= 0.5; sMax += 0.5; }
        const pad = Math.max((sMax - sMin) * 0.08, 0.00001);
        const cMin = s.convert && s.domainMin !== undefined ? s.convert(s.domainMin) : s.domainMin;
        const cMax = s.convert && s.domainMax !== undefined ? s.convert(s.domainMax) : s.domainMax;
        sMin = cMin !== undefined ? Math.max(cMin, sMin - pad) : sMin - pad;
        sMax = cMax !== undefined ? Math.min(cMax, sMax + pad) : sMax + pad;
        return { field: s.field, label: s.label, color: s.color, unit: s.unit, vals, sMin, sMax };
      });

      const chart: ComputedChart = { timestamps, series: computedSeries, tStart, dur, PL, PR, PT, PB };
      this._charts.set(group.id, chart);
      this._renderChart(group.id, chart, null);
    }

    // State chart
    const stateIdx = run.fields.indexOf('samplingState');
    if (stateIdx >= 0) {
      const pts = run.rows
        .map(row => ({ ts: Number(row[tsIdx]), state: resolveStateName(String(row[stateIdx])) }))
        .filter(p => isFinite(p.ts));
      if (pts.length >= 2) {
        this._statePts = pts;
        this._drawStateChart('chart-states', pts, null);
      }
    }
  }

  private _renderChart(canvasId: string, chart: ComputedChart, hoverIdx: number | null) {
    const canvas = this.shadowRoot?.querySelector<HTMLCanvasElement>(`#chart-${canvasId}`);
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
    const { PL, PR, PT, PB, tStart, dur, timestamps, series } = chart;
    const cW = W - PL - PR, cH = H - PT - PB;

    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, W, H);

    const tsToX = (ts: number) => PL + cW * (ts - tStart) / dur;

    // Grid (5 lines based on series[0] scale)
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth   = 1;
    for (let i = 0; i <= 4; i++) {
      const y = PT + cH * i / 4;
      ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(W - PR, y); ctx.stroke();
    }

    // X ticks
    const tickMs = pickTickMs(dur);
    ctx.font      = '8px monospace'; ctx.textAlign = 'center';
    for (let el = 0; el <= dur + tickMs * 0.01; el += tickMs) {
      const x = PL + cW * el / dur;
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, PT); ctx.lineTo(x, PT + cH); ctx.stroke();
      ctx.fillStyle = '#3f3f46';
      ctx.fillText(fmtTick(el), Math.min(x, W - PR), PT + cH + PB - 6);
    }

    // Y axis labels — per series
    ctx.font = '9px monospace';
    series.forEach((s, si) => {
      const range = s.sMax - s.sMin;
      if (si === 0) {
        ctx.textAlign = 'right';
        ctx.fillStyle = s.color;
        for (let i = 0; i <= 4; i++) {
          const v = s.sMax - range * i / 4;
          ctx.fillText(yFmt(v, range), PL - 5, PT + cH * i / 4 + 3.5);
        }
      } else if (si === 1) {
        ctx.textAlign = 'left';
        ctx.fillStyle = s.color;
        for (let i = 0; i <= 4; i++) {
          const v = s.sMax - range * i / 4;
          ctx.fillText(yFmt(v, range), W - PR + 10, PT + cH * i / 4 + 3.5);
        }
      } else if (si === 2) {
        ctx.textAlign = 'left';
        ctx.fillStyle = s.color;
        for (let i = 0; i <= 4; i++) {
          const v = s.sMax - range * i / 4;
          ctx.fillText(yFmt(v, range), W - PR + 10 + 52, PT + cH * i / 4 + 3.5);
        }
      }
    });

    // Series lines + fills
    series.forEach(s => {
      const { sMin, sMax, vals, color } = s;
      const coords: [number, number][] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const v = vals[i];
        if (!isFinite(v)) continue;
        coords.push([tsToX(timestamps[i]), PT + cH * (1 - (v - sMin) / (sMax - sMin))]);
      }
      if (coords.length < 2) return;

      const grad = ctx.createLinearGradient(0, PT, 0, PT + cH);
      grad.addColorStop(0, color + '26');
      grad.addColorStop(1, color + '00');
      ctx.beginPath();
      ctx.moveTo(coords[0][0], PT + cH);
      for (const [x, y] of coords) ctx.lineTo(x, y);
      ctx.lineTo(coords[coords.length - 1][0], PT + cH);
      ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();

      ctx.strokeStyle = color; ctx.lineWidth = 1.6;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(coords[0][0], coords[0][1]);
      for (let i = 1; i < coords.length; i++) ctx.lineTo(coords[i][0], coords[i][1]);
      ctx.stroke();
    });

    // Hover
    if (hoverIdx !== null) {
      const hx = tsToX(timestamps[hoverIdx]);

      // Crosshair
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(hx, PT); ctx.lineTo(hx, PT + cH); ctx.stroke();
      ctx.setLineDash([]);

      // Dots
      series.forEach(s => {
        const v = s.vals[hoverIdx];
        if (!isFinite(v)) return;
        const hy = PT + cH * (1 - (v - s.sMin) / (s.sMax - s.sMin));
        ctx.beginPath(); ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
        ctx.fillStyle   = '#09090b'; ctx.fill();
        ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.stroke();
      });

      // Tooltip
      const elapsed  = timestamps[hoverIdx] - tStart;
      const elStr    = '+' + fmtElapsed(elapsed);
      const lines    = series.map(s => {
        const v = s.vals[hoverIdx];
        if (!isFinite(v)) return null;
        const range = s.sMax - s.sMin;
        return { text: `${s.label}: ${yFmt(v, range)} ${s.unit}`, color: s.color };
      }).filter((l): l is { text: string; color: string } => l !== null);

      const PAD    = 8;
      const lh     = 14;
      const tipW   = 140;
      const tipH   = PAD * 2 + lh + lines.length * lh;
      const spaceR = W - PR - hx;
      const tipX   = spaceR > tipW + 12 ? hx + 8 : hx - tipW - 8;
      const tipY   = Math.max(PT, Math.min(PT + cH - tipH, PT + cH / 2 - tipH / 2));

      ctx.fillStyle   = '#1c1c1f';
      ctx.strokeStyle = '#3f3f46';
      ctx.lineWidth   = 1;
      roundRect(ctx, tipX, tipY, tipW, tipH, 5);
      ctx.fill();
      roundRect(ctx, tipX, tipY, tipW, tipH, 5);
      ctx.stroke();

      ctx.font      = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#71717a';
      ctx.fillText(elStr, tipX + PAD, tipY + PAD + 9);

      lines.forEach((l, i) => {
        ctx.fillStyle = l.color;
        ctx.fillText(l.text, tipX + PAD, tipY + PAD + 9 + lh * (i + 1));
      });
    }
  }

  private _bindHoverListeners() {
    for (const [id] of this._charts) {
      if (this._boundListeners.has(id)) continue;
      const canvas = this.shadowRoot?.querySelector<HTMLCanvasElement>(`#chart-${id}`);
      if (!canvas) continue;
      this._boundListeners.add(id);

      canvas.addEventListener('mousemove', (e: MouseEvent) => {
        const currentChart = this._charts.get(id);
        if (!currentChart) return;
        const canvasRect = canvas.getBoundingClientRect();
        const relX       = e.clientX - canvasRect.left;
        const canvasW    = canvasRect.width;
        const { PL, PR, tStart, dur } = currentChart;
        const t = tStart + dur * (relX - PL) / (canvasW - PL - PR);
        let nearestIdx = 0;
        let bestDist   = Infinity;
        for (let i = 0; i < currentChart.timestamps.length; i++) {
          const d = Math.abs(currentChart.timestamps[i] - t);
          if (d < bestDist) { bestDist = d; nearestIdx = i; }
        }
        this._renderChart(id, currentChart, nearestIdx);
      });

      canvas.addEventListener('mouseleave', () => {
        const currentChart = this._charts.get(id);
        if (!currentChart) return;
        this._renderChart(id, currentChart, null);
      });
    }

    // State chart hover
    if (!this._stateListenerBound && this._statePts.length >= 2) {
      const stateCanvas = this.shadowRoot?.querySelector<HTMLCanvasElement>('#chart-states');
      if (stateCanvas) {
        this._stateListenerBound = true;
        stateCanvas.addEventListener('mousemove', (e: MouseEvent) => {
          if (!this._statePts.length) return;
          const r    = stateCanvas.getBoundingClientRect();
          const relX = e.clientX - r.left;
          this._drawStateChart('chart-states', this._statePts, relX);
        });
        stateCanvas.addEventListener('mouseleave', () => {
          this._drawStateChart('chart-states', this._statePts, null);
        });
      }
    }
  }

  private _drawStateChart(canvasId: string, ptsRaw: { ts: number; state: string }[], hoverX: number | null) {
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

    // Normalize timestamps to ms
    const pts = ptsRaw.map(p => ({ ts: toMs(p.ts), state: p.state }));
    const uniqueStates = [...new Set(pts.map(p => p.state))];

    const W = rect.width, H = rect.height;
    const PL = 0, PR = 0, PT = 0, PB = 20;
    const cW = W - PL - PR, cH = H - PT - PB;

    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, W, H);

    const tStart = pts[0].ts, tEnd = pts[pts.length - 1].ts;
    const dur    = Math.max(tEnd - tStart, 1);
    const tsToX  = (ts: number) => PL + cW * (ts - tStart) / dur;

    // Draw filled segments (progress-bar style)
    for (let i = 0; i < pts.length; i++) {
      const x0    = tsToX(pts[i].ts);
      const x1    = i < pts.length - 1 ? tsToX(pts[i + 1].ts) : PL + cW;
      const color = resolveStateColor(pts[i].state, uniqueStates);
      ctx.fillStyle = color + '55';
      ctx.fillRect(x0, PT, x1 - x0, cH);
      // Bold top stripe
      ctx.fillStyle = color;
      ctx.fillRect(x0, PT, x1 - x0, 4);
    }

    // Draw thin dividers between state transitions
    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 1.5;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].state !== pts[i - 1].state) {
        const x = tsToX(pts[i].ts);
        ctx.beginPath(); ctx.moveTo(x, PT); ctx.lineTo(x, PT + cH); ctx.stroke();
      }
    }

    // Time axis
    const tickMs = pickTickMs(dur);
    ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#52525b';
    for (let el = 0; el <= dur + tickMs * 0.01; el += tickMs) {
      const x = PL + cW * el / dur;
      ctx.fillText(fmtTick(el), Math.min(x, W - PR - 4), PT + cH + PB - 5);
    }

    // Hover tooltip
    if (hoverX !== null) {
      const t = tStart + dur * hoverX / cW;
      // Find which segment hoverX falls in
      let segIdx = pts.length - 1;
      for (let i = 0; i < pts.length - 1; i++) {
        if (t < pts[i + 1].ts) { segIdx = i; break; }
      }
      const seg   = pts[segIdx];
      const color = resolveStateColor(seg.state, uniqueStates);
      const elStr = fmtTick(seg.ts - tStart);

      // Vertical cursor line
      const cursorX = Math.max(1, Math.min(cW - 1, hoverX));
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(cursorX, PT); ctx.lineTo(cursorX, PT + cH); ctx.stroke();

      // Tooltip
      const PAD  = 8, lh = 14;
      const tipW = 120;
      const tipH = PAD * 2 + lh * 2;
      const spaceR = cW - cursorX;
      const tipX   = spaceR > tipW + 12 ? cursorX + 8 : cursorX - tipW - 8;
      const tipY   = PT + cH / 2 - tipH / 2;

      ctx.fillStyle   = '#1c1c1f';
      ctx.strokeStyle = '#3f3f46';
      ctx.lineWidth   = 1;
      roundRect(ctx, tipX, tipY, tipW, tipH, 5);
      ctx.fill();
      roundRect(ctx, tipX, tipY, tipW, tipH, 5);
      ctx.stroke();

      ctx.font = '9px monospace'; ctx.textAlign = 'left';
      ctx.fillStyle = '#71717a';
      ctx.fillText(elStr, tipX + PAD, tipY + PAD + 9);
      ctx.fillStyle = color;
      ctx.fillText(seg.state, tipX + PAD, tipY + PAD + 9 + lh);
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────

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
    window.location.hash = resolveRouterPath('sync');
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

    .back-btn:hover { color: var(--fg); border-color: #72727a; }

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

    /* ── Hero ── */
    .hero {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 4px 0 12px;
    }

    .hero-name {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: var(--fg);
      line-height: 1.1;
    }

    .hero-meta {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--muted-fg);
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 2px;
    }

    .hero-meta span { display: flex; align-items: center; gap: 4px; }

    /* ── Key stats ── */
    /* ── Flow + Battery row ── */
    .flow-batt-row {
      display: flex;
      gap: 8px;
    }

    .flow-batt-cell {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .flow-batt-cell--flow { flex-shrink: 0; }
    .flow-batt-cell--batt { flex: 1; min-width: 0; }

    .batt-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 18px;
      align-items: flex-end;
    }

    .batt-item {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .batt-sub {
      font-size: 0.6rem;
      font-weight: 500;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #52525b;
    }

    .batt-val {
      font-family: var(--mono);
      font-size: 1rem;
      font-weight: 700;
      color: var(--fg);
      letter-spacing: -0.01em;
    }

    .batt-unit {
      font-size: 0.68rem;
      font-weight: 400;
      color: var(--muted-fg);
      margin-left: 1px;
    }

    .key-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }

    .key-stat {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .key-stat-label {
      font-size: 0.62rem;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted-fg);
    }

    .key-stat-inline {
      display: flex;
      align-items: baseline;
      gap: 4px;
    }

    .key-stat-value {
      font-family: var(--mono);
      font-size: 1.125rem;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .key-stat-unit {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--muted-fg);
    }

    .key-stat-range {
      font-family: var(--mono);
      font-size: 0.6rem;
      color: var(--muted-fg);
      letter-spacing: 0.01em;
    }

    canvas.stat-spark {
      width: 100%;
      height: 28px;
      display: block;
      margin-top: 6px;
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

    .upload-badge.uploaded { color: #22c55e; background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.25); }
    .upload-badge.pending  { color: var(--muted-fg); background: transparent; border: 1px solid var(--border); }
    .upload-badge.error    { color: #f87171; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); }

    /* ── Cloud badge ── */
    .cloud-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 0.7rem;
      font-family: var(--mono);
      padding: 2px 8px;
      border-radius: 4px;
      color: #60a5fa;
      background: rgba(59,130,246,0.08);
      border: 1px solid rgba(59,130,246,0.2);
    }

    /* ── Info rows ── */
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

    /* ── Charts ── */
    canvas {
      width: 100%;
      height: 170px;
      border-radius: 4px;
      display: block;
    }

    canvas.state-canvas { height: 52px; }

    .chart-legend {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      margin-top: 10px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .legend-swatch {
      width: 16px; height: 2.5px;
      border-radius: 2px;
      flex-shrink: 0;
    }

    .legend-swatch.dashed { background: none !important; border-top: 2.5px dashed currentColor; }

    .legend-label {
      font-family: var(--mono);
      font-size: 0.68rem;
      color: var(--muted-fg);
    }

    .legend-value {
      font-family: var(--mono);
      font-size: 0.68rem;
      color: var(--fg);
      font-weight: 500;
    }

    /* State legend dots */
    .legend-dot {
      width: 8px; height: 8px;
      border-radius: 2px;
      flex-shrink: 0;
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

    .btn-sm:hover        { border-color: #72727a; color: var(--fg); }
    .btn-sm.danger:hover { border-color: #ef4444; color: #f87171; }

    .no-data {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--muted-fg);
      text-align: center;
      padding: 20px 0;
    }

    .state-msg {
      font-family: var(--mono);
      font-size: 0.85rem;
      color: var(--muted-fg);
      text-align: center;
      padding: 60px 20px;
    }

    @media (max-width: 480px) {
      canvas { height: 130px; }
      .key-stats { grid-template-columns: repeat(2, 1fr); }
    }
  `;

  // ── Render ────────────────────────────────────────────────────────────

  render() {
    if (this.loading) return html`
      <main>
        <div class="page-header">
          <a class="back-btn" href="${resolveRouterPath('sync')}">←</a>
          <span class="page-title">Loading…</span>
        </div>
        <p class="state-msg">Loading run from cloud…</p>
      </main>`;

    if (this.error || !this.run) return html`
      <main>
        <div class="page-header">
          <a class="back-btn" href="${resolveRouterPath('sync')}">←</a>
          <span class="page-title">Error</span>
        </div>
        <p class="state-msg">${this.error || 'Run not found.'}</p>
      </main>`;

    const run         = this.run;
    const runName     = run.meta?.tagId || `Run #${run.id}`;
    const duration    = this._duration();
    const lat         = run.meta.lat ? parseFloat(run.meta.lat) : null;
    const lon         = run.meta.lon ? parseFloat(run.meta.lon) : null;
    const hasLocation = lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0);
    const hasStates   = run.fields.includes('samplingState');
    const stateIdx    = run.fields.indexOf('samplingState');
    const uniqueStates = stateIdx >= 0 ? [...new Set(run.rows.map(r => resolveStateName(String(r[stateIdx]))))] : [];
    const activeGroups = CHART_GROUPS.filter(g => g.series.some(s => run.fields.includes(s.field)));

    // Key stats
    const pressureConvert = (v: number) => v / 100_000;
    const flowSpMax   = maxVal(run, 'flowrateSP');
    const socStart    = firstVal(run, 'soc');
    const socEnd      = lastVal(run,  'soc');
    const socDelta    = (socStart !== null && socEnd !== null) ? socEnd - socStart : null;
    const vStart      = firstVal(run, 'voltage');
    const vEnd        = lastVal(run,  'voltage');
    const hasBattery  = socStart !== null || vStart !== null;
    const tempAvg    = avgVal(run, 'temperature');
    const tempMin    = minVal(run, 'temperature');
    const tempMax    = maxVal(run, 'temperature');
    const humAvg     = avgVal(run, 'humidity');
    const humMin     = minVal(run, 'humidity');
    const humMax     = maxVal(run, 'humidity');
    const presAvgRaw = avgVal(run, 'pressure');
    const presMinRaw = minVal(run, 'pressure');
    const presMaxRaw = maxVal(run, 'pressure');
    const presAvg    = presAvgRaw !== null ? pressureConvert(presAvgRaw) : null;
    const presMin    = presMinRaw !== null ? pressureConvert(presMinRaw) : null;
    const presMax    = presMaxRaw !== null ? pressureConvert(presMaxRaw) : null;

    const uploadBadge = !this.isCloud ? (
      run.firebaseId
        ? html`<span class="upload-badge uploaded">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
            Uploaded
          </span>`
        : run.uploadError === 'duplicate'
          ? html`<span class="upload-badge error">Duplicate tag</span>`
          : html`<span class="upload-badge pending">Not uploaded</span>`
    ) : html``;

    const cloudBadge = this.isCloud ? html`
      <span class="cloud-badge">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
        </svg>
        Cloud
      </span>` : html``;

    return html`
      <main>
        <div class="page-header">
          <a class="back-btn" href="${resolveRouterPath('sync')}">←</a>
          <span class="page-title">${runName}</span>
          <div class="header-actions">
            <button class="btn-sm" @click=${this._download}>CSV</button>
            ${!this.isCloud ? html`
              <button class="btn-sm danger" @click=${this._delete}>Delete</button>` : ''}
          </div>
        </div>

        <div class="content">

          <!-- Hero -->
          <div class="card">
            <div class="hero">
              <span class="hero-name">${runName}</span>
              <div class="hero-meta">
                ${run.meta.startTime ? html`<span>${new Date(run.meta.startTime).toLocaleString()}</span>` : ''}
                ${run.meta.deviceName ? html`<span>${run.meta.deviceName}</span>` : ''}
                <span>⏱ ${fmtElapsed(duration)}</span>
                <span>${run.rows.length} datapoints · ${run.meta.interval.toFixed(0)}ms interval</span>
              </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
              ${uploadBadge}
              ${cloudBadge}
              ${hasLocation ? html`
                <span style="font-family:var(--mono);font-size:0.65rem;color:var(--muted-fg);">
                  📍 ${lat!.toFixed(5)}, ${lon!.toFixed(5)}
                </span>` : ''}
            </div>
          </div>

          <!-- Flow + Battery row -->
          ${(flowSpMax !== null || hasBattery) ? html`
            <div class="flow-batt-row">
              ${flowSpMax !== null ? html`
                <div class="flow-batt-cell flow-batt-cell--flow">
                  <span class="key-stat-label">Flow Setpoint</span>
                  <div class="key-stat-inline">
                    <span class="key-stat-value" style="color:#f59e0b">${flowSpMax.toFixed(3)}</span>
                    <span class="key-stat-unit">L/s</span>
                  </div>
                </div>` : ''}
              ${hasBattery ? html`
                <div class="flow-batt-cell flow-batt-cell--batt">
                  <span class="key-stat-label">Battery</span>
                  <div class="batt-stats">
                    ${socStart !== null ? html`
                      <span class="batt-item">
                        <span class="batt-sub">SoC start</span>
                        <span class="batt-val" style="color:#22c55e">${socStart.toFixed(0)}<span class="batt-unit">%</span></span>
                      </span>` : ''}
                    ${socEnd !== null ? html`
                      <span class="batt-item">
                        <span class="batt-sub">end</span>
                        <span class="batt-val" style="color:${(socEnd ?? 100) < 20 ? '#ef4444' : (socEnd ?? 100) < 50 ? '#f59e0b' : '#22c55e'}">${socEnd.toFixed(0)}<span class="batt-unit">%</span></span>
                      </span>` : ''}
                    ${socDelta !== null ? html`
                      <span class="batt-item">
                        <span class="batt-sub">used</span>
                        <span class="batt-val" style="color:#a78bfa">${Math.abs(socDelta).toFixed(1)}<span class="batt-unit">%</span></span>
                      </span>` : ''}
                    ${vStart !== null ? html`
                      <span class="batt-item">
                        <span class="batt-sub">V start</span>
                        <span class="batt-val">${vStart.toFixed(2)}<span class="batt-unit">V</span></span>
                      </span>` : ''}
                    ${vEnd !== null ? html`
                      <span class="batt-item">
                        <span class="batt-sub">end</span>
                        <span class="batt-val">${vEnd.toFixed(2)}<span class="batt-unit">V</span></span>
                      </span>` : ''}
                  </div>
                </div>` : ''}
            </div>` : ''}

          <!-- Key stats: env 3-column -->
          ${(tempAvg !== null || humAvg !== null || presAvg !== null) ? html`
            <div class="key-stats">
              ${tempAvg !== null ? html`
                <div class="key-stat">
                  <span class="key-stat-label">Temperature</span>
                  <div class="key-stat-inline">
                    <span class="key-stat-value" style="color:#f97316">${tempAvg.toFixed(1)}</span>
                    <span class="key-stat-unit">°C</span>
                  </div>
                  ${(tempMin !== null && tempMax !== null) ? html`
                    <span class="key-stat-range">${tempMin.toFixed(1)} — ${tempMax.toFixed(1)} °C</span>` : ''}
                  <canvas class="stat-spark" id="spark-temperature"></canvas>
                </div>` : ''}
              ${humAvg !== null ? html`
                <div class="key-stat">
                  <span class="key-stat-label">Humidity</span>
                  <div class="key-stat-inline">
                    <span class="key-stat-value" style="color:#06b6d4">${humAvg.toFixed(1)}</span>
                    <span class="key-stat-unit">%RH</span>
                  </div>
                  ${(humMin !== null && humMax !== null) ? html`
                    <span class="key-stat-range">${humMin.toFixed(1)} — ${humMax.toFixed(1)} %RH</span>` : ''}
                  <canvas class="stat-spark" id="spark-humidity"></canvas>
                </div>` : ''}
              ${presAvg !== null ? html`
                <div class="key-stat">
                  <span class="key-stat-label">Pressure</span>
                  <div class="key-stat-inline">
                    <span class="key-stat-value" style="color:#6366f1">${presAvg.toFixed(4)}</span>
                    <span class="key-stat-unit">bar</span>
                  </div>
                  ${(presMin !== null && presMax !== null) ? html`
                    <span class="key-stat-range">${presMin.toFixed(4)} — ${presMax.toFixed(4)} bar</span>` : ''}
                  <canvas class="stat-spark" id="spark-pressure"></canvas>
                </div>` : ''}
            </div>` : ''}

          <!-- State timeline -->
          ${hasStates ? html`
            <div class="card">
              <div class="card-header">
                <span class="card-title">Sampling State</span>
              </div>
              <canvas id="chart-states" class="state-canvas"></canvas>
              <div class="chart-legend" style="margin-top:8px">
                ${uniqueStates.map(s => html`
                  <div class="legend-item">
                    <span class="legend-dot" style="background:${resolveStateColor(s, uniqueStates)}"></span>
                    <span class="legend-label">${s}</span>
                  </div>`)}
              </div>
            </div>` : ''}

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
                    ${presentSeries.map(s => {
                      const last = lastVal(run, s.field);
                      const converted = (last !== null && s.convert) ? s.convert(last) : last;
                      return html`
                        <div class="legend-item">
                          <span class="legend-swatch ${s.dashed ? 'dashed' : ''}"
                            style="${s.dashed ? `color:${s.color}` : `background:${s.color}`}"></span>
                          <span class="legend-label">${s.label}</span>
                          ${converted !== null ? html`
                            <span class="legend-value">${converted.toFixed(2)} ${s.unit}</span>` : ''}
                        </div>`;
                    })}
                  </div>` : html`<div class="no-data">Not enough data.</div>`}
              </div>
            `;
          })}

          <!-- Location map -->
          ${hasLocation ? html`
            <div class="card">
              <div class="card-header">
                <span class="card-title">Location</span>
                <div style="display:flex;gap:6px;">
                  <a class="btn-sm"
                     href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}"
                     target="_blank" rel="noopener">OSM ↗</a>
                  <a class="btn-sm"
                     href="https://www.google.com/maps?q=${lat},${lon}"
                     target="_blank" rel="noopener">Google Maps ↗</a>
                </div>
              </div>
              <iframe class="map-frame"
                src="https://www.openstreetmap.org/export/embed.html?bbox=${lon! - 0.005},${lat! - 0.005},${lon! + 0.005},${lat! + 0.005}&layer=mapnik&marker=${lat},${lon}"
                loading="lazy"></iframe>
            </div>` : ''}

        </div>
      </main>
    `;
  }
}
