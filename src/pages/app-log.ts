import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import { getLogData, getRawLines, onLogDataChanged, LogDataRow, getAboutData, AboutData } from '../log-store';
import { uploadLog } from '../history-store';

// ── Chart colors per source ───────────────────────────────────────────────
const SOURCE_COLORS: Record<string, string> = {
  'Sensor1': '#00e5ff',
  'Sensor2': '#7c3aed',
  'Servo':   '#00ffa3',
};

function colorFor(source: string): string {
  return SOURCE_COLORS[source] ?? '#ff6b35';
}

// ── Component ─────────────────────────────────────────────────────────────
@customElement('app-log')
export class AppLog extends LitElement {

  @state() private data: LogDataRow[] = [];
  @state() private rawLines: string[] = [];
  @state() private about: AboutData | null = null;
  @state() private activeSource = 'all';
  @state() private activeChart = 0; // which value column to chart
  @state() private uploadStatus: 'idle' | 'uploading' | 'done' | 'error' = 'idle';
  @state() private uploadMsg = '';

  private _unsub?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.data = getLogData();
    this.rawLines = getRawLines();
    this.about = getAboutData();
    this._unsub = onLogDataChanged(() => {
      this.data = getLogData();
      this.rawLines = getRawLines();
      this.about = getAboutData();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsub?.();
  }

  updated() {
    this._drawChart();
  }

  /* ── Sources ── */
  private get sources(): string[] {
    const set = new Set(this.data.map(r => r.source));
    return Array.from(set);
  }

  private get filteredData(): LogDataRow[] {
    if (this.activeSource === 'all') return this.data;
    return this.data.filter(r => r.source === this.activeSource);
  }

  /* ── Column headers based on source ── */
  private get valueHeaders(): string[] {
    if (this.activeSource === 'Sensor1' || this.activeSource === 'Sensor2') {
      return ['Temp (°C)', 'Pressure (Pa)', 'Altitude (m)', 'Humidity (%)'];
    }
    if (this.activeSource === 'Servo') {
      return ['Position', 'Speed', '', 'Load', 'Voltage (V)', 'Temp (°C)'];
    }
    // Generic
    const maxCols = Math.max(...this.filteredData.map(r => r.values.length), 0);
    return Array.from({ length: maxCols }, (_, i) => `Value ${i + 1}`);
  }

  /* ── Chart drawing ── */
  private _drawChart() {
    const canvas = this.shadowRoot?.querySelector<HTMLCanvasElement>('#chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const PAD_L = 55;
    const PAD_R = 15;
    const PAD_T = 15;
    const PAD_B = 30;

    // Clear
    ctx.fillStyle = '#0e1118';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(0,229,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = PAD_T + (H - PAD_T - PAD_B) * i / 5;
      ctx.beginPath();
      ctx.moveTo(PAD_L, y);
      ctx.lineTo(W - PAD_R, y);
      ctx.stroke();
    }

    // Group data by source for overlay
    const sourcesToDraw = this.activeSource === 'all' ? this.sources : [this.activeSource];
    const colIdx = this.activeChart;

    // Collect all numeric values to find global min/max
    let allVals: number[] = [];
    for (const src of sourcesToDraw) {
      const rows = this.data.filter(r => r.source === src);
      for (const r of rows) {
        const v = parseFloat(r.values[colIdx]);
        if (!isNaN(v)) allVals.push(v);
      }
    }

    if (allVals.length === 0) {
      ctx.fillStyle = '#4a5568';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No numeric data for this column', W / 2, H / 2);
      return;
    }

    let minV = Math.min(...allVals);
    let maxV = Math.max(...allVals);
    if (minV === maxV) { minV -= 1; maxV += 1; }
    const rangeV = maxV - minV;

    // Y-axis labels
    ctx.fillStyle = '#4a5568';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const val = maxV - rangeV * i / 5;
      const y = PAD_T + (H - PAD_T - PAD_B) * i / 5;
      ctx.fillText(val.toFixed(1), PAD_L - 6, y + 3);
    }

    // Draw lines per source
    for (const src of sourcesToDraw) {
      const rows = this.data.filter(r => r.source === src);
      const points: Array<{ x: number; y: number }> = [];

      for (let i = 0; i < rows.length; i++) {
        const v = parseFloat(rows[i].values[colIdx]);
        if (isNaN(v)) continue;
        const x = PAD_L + (W - PAD_L - PAD_R) * i / Math.max(rows.length - 1, 1);
        const y = PAD_T + (H - PAD_T - PAD_B) * (1 - (v - minV) / rangeV);
        points.push({ x, y });
      }

      if (points.length < 2) continue;

      // Line
      ctx.strokeStyle = colorFor(src);
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();

      // Dots
      ctx.fillStyle = colorFor(src);
      for (const p of points) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // X-axis label
    ctx.fillStyle = '#4a5568';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Sample index →', W / 2, H - 5);
  }

  /* ── Upload to Cloud ── */
  private async _uploadToCloud() {
    this.uploadStatus = 'uploading';
    this.uploadMsg = '';
    try {
      await uploadLog(this.rawLines, this.about);
      this.uploadStatus = 'done';
      this.uploadMsg = 'Uploaded successfully';
    } catch (e: unknown) {
      this.uploadStatus = 'error';
      this.uploadMsg = e instanceof Error ? e.message : 'Upload failed';
    }
  }

  /* ── Download CSV ── */
  private _downloadCSV() {
    const csvContent = this.rawLines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'airsampler_log.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Styles ── */
  static styles = css`
    :host {
      --bg:      #08090d;
      --surface: #0e1118;
      --border:  #1e2535;
      --accent:  #00e5ff;
      --accent2: #7c3aed;
      --ok:      #00ffa3;
      --warn:    #ff6b35;
      --text:    #c8d6ef;
      --muted:   #4a5568;
      --mono:    'Share Tech Mono', monospace;
      --display: 'Oxanium', sans-serif;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    main {
      font-family: var(--display);
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0 0 60px;
      position: relative;
    }

    main::before {
      content: '';
      position: fixed;
      inset: 0;
      background-image:
        linear-gradient(rgba(0,229,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,229,255,0.03) 1px, transparent 1px);
      background-size: 40px 40px;
      pointer-events: none;
      z-index: 0;
    }

    .page-header {
      width: 100%;
      padding: 20px 24px 0;
      display: flex;
      align-items: center;
      gap: 12px;
      z-index: 1;
    }

    .logo-icon {
      width: 34px; height: 34px;
      border: 2px solid var(--ok);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 12px rgba(0,255,163,0.4);
      flex-shrink: 0;
    }

    .logo-icon svg { width: 18px; height: 18px; fill: var(--ok); }

    .page-title {
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--ok);
    }

    .content {
      width: 100%;
      max-width: 900px;
      padding: 28px 20px;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* Cards */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px;
      position: relative;
      overflow: hidden;
    }

    .card::after {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--ok), transparent);
    }

    .card-title {
      font-family: var(--mono);
      font-size: 0.72rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ok);
      margin-bottom: 14px;
    }

    /* Filter tabs */
    .filter-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }

    .filter-btn {
      font-family: var(--mono);
      font-size: 0.68rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 6px 14px;
      border-radius: 5px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      transition: all 0.2s;
    }

    .filter-btn:hover { border-color: var(--accent); color: var(--accent); }
    .filter-btn.active { border-color: var(--ok); color: var(--ok); background: rgba(0,255,163,0.08); }

    /* Chart selector */
    .chart-selector {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }

    .chart-tab {
      font-family: var(--mono);
      font-size: 0.62rem;
      letter-spacing: 0.06em;
      padding: 4px 10px;
      border-radius: 4px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      transition: all 0.2s;
    }

    .chart-tab:hover { border-color: var(--accent2); color: var(--accent2); }
    .chart-tab.active { border-color: var(--accent2); color: var(--accent2); background: rgba(124,58,237,0.1); }

    /* Canvas chart */
    canvas {
      width: 100%;
      height: 260px;
      border: 1px solid var(--border);
      border-radius: 8px;
    }

    /* Legend */
    .legend {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      margin-top: 8px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: var(--mono);
      font-size: 0.68rem;
      color: var(--muted);
    }

    .legend-dot {
      width: 10px; height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    /* Table */
    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: 8px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-family: var(--mono);
      font-size: 0.72rem;
    }

    th {
      padding: 10px 12px;
      text-align: left;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent);
      background: rgba(0,229,255,0.05);
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }

    td {
      padding: 8px 12px;
      border-bottom: 1px solid rgba(30,37,53,0.5);
      color: var(--text);
      white-space: nowrap;
    }

    tr:hover td { background: rgba(0,229,255,0.03); }

    .source-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.62rem;
      font-weight: 600;
      letter-spacing: 0.06em;
    }

    /* Action buttons */
    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .btn {
      font-family: var(--display);
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 10px 22px;
      border-radius: 7px;
      border: none;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.15s;
      text-decoration: none;
    }

    .btn:hover { opacity: 0.88; transform: translateY(-1px); }

    .btn-download {
      background: var(--ok);
      color: var(--bg);
    }

    .btn-upload {
      background: var(--warn);
      color: var(--bg);
    }

    .btn-upload:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .upload-status {
      font-family: var(--mono);
      font-size: 0.7rem;
      letter-spacing: 0.06em;
      padding: 4px 0;
    }

    .upload-status.done { color: var(--ok); }
    .upload-status.error { color: var(--warn); }

    .nav-back {
      font-family: var(--mono);
      font-size: 0.72rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      background: none;
      border: 1px solid var(--border);
      color: var(--muted);
      padding: 9px 18px;
      border-radius: 6px;
      cursor: pointer;
      transition: color 0.2s, border-color 0.2s;
      text-decoration: none;
      display: inline-block;
    }

    .nav-back:hover { color: var(--accent); border-color: var(--accent); }

    .empty-msg {
      font-family: var(--mono);
      font-size: 0.82rem;
      color: var(--muted);
      text-align: center;
      padding: 40px 20px;
    }

    .row-count {
      font-family: var(--mono);
      font-size: 0.65rem;
      color: var(--muted);
      margin-top: 6px;
    }

    /* About metadata */
    .about-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .about-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .about-label {
      font-family: var(--mono);
      font-size: 0.6rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .about-value {
      font-family: var(--mono);
      font-size: 0.82rem;
      color: var(--accent);
      word-break: break-all;
    }

    .about-value a {
      color: var(--accent2);
      text-decoration: underline;
    }

    @media (max-width: 480px) {
      .card { padding: 16px; }
      canvas { height: 200px; }
      .about-grid { grid-template-columns: 1fr; }
    }
  `;

  render() {
    if (this.data.length === 0) {
      return html`
        <main>
          <div class="page-header">
            <div class="logo-icon">
              <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z"/></svg>
            </div>
            <span class="page-title">Log Viewer</span>
          </div>
          <div class="content">
            <div class="empty-msg">
              No log data loaded. Go to the BLE page, connect to the device, and press "Request Log".
            </div>
            <div>
              <a class="nav-back" href="${resolveRouterPath('ble')}">← Back to BLE Control</a>
            </div>
          </div>
        </main>
      `;
    }

    const filtered = this.filteredData;
    const headers = this.valueHeaders;

    return html`
      <main>
        <div class="page-header">
          <div class="logo-icon">
            <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z"/></svg>
          </div>
          <span class="page-title">Log Viewer</span>
        </div>

        <div class="content">

          <!-- About metadata -->
          ${this.about ? html`
            <div class="card">
              <div class="card-title">Log Metadata</div>
              <div class="about-grid">
                ${this.about.rfidTag ? html`
                  <div class="about-item">
                    <span class="about-label">RFID Tag</span>
                    <span class="about-value">${this.about.rfidTag}</span>
                  </div>
                ` : ''}
                ${this.about.deviceName ? html`
                  <div class="about-item">
                    <span class="about-label">Device</span>
                    <span class="about-value">${this.about.deviceName}</span>
                  </div>
                ` : ''}
                ${this.about.gpsLat && this.about.gpsLng ? html`
                  <div class="about-item">
                    <span class="about-label">GPS Location</span>
                    <span class="about-value">
                      <a href="https://www.google.com/maps?q=${this.about.gpsLat},${this.about.gpsLng}" target="_blank" rel="noopener">
                        ${this.about.gpsLat}, ${this.about.gpsLng}
                      </a>
                    </span>
                  </div>
                ` : ''}
                ${this.about.logStart ? html`
                  <div class="about-item">
                    <span class="about-label">Log Start</span>
                    <span class="about-value">${this.about.logStart}</span>
                  </div>
                ` : ''}
                ${this.about.logEnd ? html`
                  <div class="about-item">
                    <span class="about-label">Log End</span>
                    <span class="about-value">${this.about.logEnd}</span>
                  </div>
                ` : ''}
              </div>
            </div>
          ` : ''}

          <!-- Filter -->
          <div class="filter-row">
            <button class="filter-btn ${this.activeSource === 'all' ? 'active' : ''}"
              @click=${() => { this.activeSource = 'all'; this.activeChart = 0; }}>All</button>
            ${this.sources.map(s => html`
              <button class="filter-btn ${this.activeSource === s ? 'active' : ''}"
                style="border-color: ${this.activeSource === s ? colorFor(s) : ''}; color: ${this.activeSource === s ? colorFor(s) : ''}"
                @click=${() => { this.activeSource = s; this.activeChart = 0; }}>${s}</button>
            `)}
          </div>

          <!-- Chart -->
          <div class="card">
            <div class="card-title">Chart</div>
            <div class="chart-selector">
              ${headers.filter(h => h).map((h, i) => html`
                <button class="chart-tab ${this.activeChart === i ? 'active' : ''}"
                  @click=${() => { this.activeChart = i; }}>${h}</button>
              `)}
            </div>
            <canvas id="chart"></canvas>
            <div class="legend">
              ${(this.activeSource === 'all' ? this.sources : [this.activeSource]).map(s => html`
                <div class="legend-item">
                  <span class="legend-dot" style="background:${colorFor(s)}"></span>
                  ${s}
                </div>
              `)}
            </div>
          </div>

          <!-- Table -->
          <div class="card">
            <div class="card-title">Data Table</div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Source</th>
                    ${headers.filter(h => h).map(h => html`<th>${h}</th>`)}
                  </tr>
                </thead>
                <tbody>
                  ${filtered.map(row => html`
                    <tr>
                      <td>${row.timestamp || '—'}</td>
                      <td><span class="source-badge" style="background:${colorFor(row.source)}22;color:${colorFor(row.source)};border:1px solid ${colorFor(row.source)}44">${row.source}</span></td>
                      ${headers.filter(h => h).map((_, i) => html`<td>${row.values[i] ?? '—'}</td>`)}
                    </tr>
                  `)}
                </tbody>
              </table>
            </div>
            <div class="row-count">${filtered.length} rows</div>
          </div>

          <!-- Actions -->
          <div class="actions">
            <button class="btn btn-download" @click=${this._downloadCSV}>Download CSV</button>
            <button class="btn btn-upload"
              ?disabled=${this.uploadStatus === 'uploading'}
              @click=${this._uploadToCloud}>
              ${this.uploadStatus === 'uploading' ? 'Uploading...' : 'Upload to Cloud'}
            </button>
          </div>
          ${this.uploadMsg ? html`
            <div class="upload-status ${this.uploadStatus}">${this.uploadMsg}</div>
          ` : ''}

          <div style="display:flex;gap:10px;">
            <a class="nav-back" href="${resolveRouterPath('ble')}">← BLE Control</a>
            <a class="nav-back" href="${resolveRouterPath()}">← Home</a>
          </div>

        </div>
      </main>
    `;
  }
}
