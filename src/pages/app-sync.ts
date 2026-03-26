import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import { bleService } from '../ble-service';
import {
  DeviceRun,
  getDeviceRuns,
  hasDeviceRun,
  saveDeviceRun,
  deleteDeviceRun,
  onDeviceRunsChanged,
  parseMeta,
  applyCarryForward,
} from '../device-log-store';

type SyncStatus = 'idle' | 'listing' | 'downloading' | 'done' | 'error';

@customElement('app-sync')
export class AppSync extends LitElement {

  @state() private connected = bleService.connStatus === 'connected';
  @state() private runs: DeviceRun[] = getDeviceRuns();

  @state() private syncStatus: SyncStatus = 'idle';
  @state() private syncMsg = '';
  @state() private syncProgress = '';   // e.g. "2 / 5"
  @state() private expandedId: number | null = null;

  private _onStatus = () => { this.connected = bleService.connStatus === 'connected'; };
  private _unsub?: () => void;

  connectedCallback() {
    super.connectedCallback();
    bleService.addEventListener('status-changed', this._onStatus);
    this._unsub = onDeviceRunsChanged(() => { this.runs = getDeviceRuns(); });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    bleService.removeEventListener('status-changed', this._onStatus);
    this._unsub?.();
  }

  /* ── Helpers ── */

  /** Extract a JSON object from a response line, or null if not JSON */
  private _tryJson(line: string): Record<string, unknown> | null {
    const t = line.trim();
    if (!t.startsWith('{')) return null;
    try { return JSON.parse(t); } catch { return null; }
  }

  /** Check if any line starts with ERROR */
  private _findError(lines: string[]): string | null {
    for (const l of lines) {
      if (l.startsWith('ERROR')) return l;
    }
    return null;
  }

  /* ── Sync ── */
  private async _sync() {
    if (this.syncStatus === 'listing' || this.syncStatus === 'downloading') return;
    this.syncStatus = 'listing';
    this.syncMsg = '';
    this.syncProgress = '';

    // 1. List all run IDs on the device
    //    Response: ACK / {"runs":[1,2,3]} / {"le":1} / DONE
    const listLines = await bleService.sendCmd('listRuns');

    const listErr = this._findError(listLines);
    if (listErr) {
      this.syncStatus = 'error';
      this.syncMsg = listErr;
      return;
    }

    // Find the {"runs":[...]} JSON line
    let deviceIds: number[] = [];
    for (const l of listLines) {
      const j = this._tryJson(l);
      if (j && Array.isArray(j['runs'])) {
        deviceIds = (j['runs'] as unknown[]).map(Number);
        break;
      }
    }

    if (deviceIds.length === 0) {
      this.syncStatus = 'done';
      this.syncMsg = 'No runs on device.';
      return;
    }

    const toDownload = deviceIds.filter(id => !hasDeviceRun(id));

    if (toDownload.length === 0) {
      this.syncStatus = 'done';
      this.syncMsg = `Already up to date — ${deviceIds.length} run(s) on device.`;
      return;
    }

    // 2. Download each missing run
    //    getStateLogs -run <N>
    //    Response: ACK / {"ls":603} / field-line / unit-line / meta-line / rows... / {"le":1} / DONE
    this.syncStatus = 'downloading';
    let done = 0;
    for (const id of toDownload) {
      this.syncProgress = `${done} / ${toDownload.length}`;

      const logLines = await bleService.sendCmd(`getStateLogs -run ${id}`);

      const logErr = this._findError(logLines);
      if (logErr) {
        this.syncStatus = 'error';
        this.syncMsg = `Run ${id}: ${logErr}`;
        return;
      }

      // sendCmd returns only lines between ACK…DONE.
      // Strip JSON control lines ({"ls":N}, {"le":1}) — keep plain CSV data lines.
      const dataLines = logLines.filter(l => {
        const t = l.trim();
        return t !== '' && !t.startsWith('{');
      });

      if (dataLines.length < 3) {
        this.syncStatus = 'error';
        this.syncMsg = `Run ${id}: not enough header lines (got ${dataLines.length})`;
        return;
      }

      const fields = ['timestamp', ...dataLines[0].split(',')];
      const units  = ['ms',        ...dataLines[1].split(',')];
      const meta   = parseMeta(dataLines[2]);

      const rawRows = dataLines.slice(3).map(l => l.split(','));
      const expanded = applyCarryForward(rawRows);
      const rows = expanded.map((row, i) => [
        String(meta.startTime + i * meta.interval),
        ...row,
      ]);

      const run: DeviceRun = {
        id,
        downloadedAt: Date.now(),
        fields,
        units,
        meta,
        rows,
      };
      saveDeviceRun(run);
      done++;
      this.syncProgress = `${done} / ${toDownload.length}`;
    }

    this.syncStatus = 'done';
    this.syncMsg = `Downloaded ${toDownload.length} new run(s). Total: ${deviceIds.length}.`;
    this.syncProgress = '';
    // All runs are now local — clear the badge
    bleService.unsyncedCount = 0;
    bleService.dispatchEvent(new CustomEvent('sync-check-changed'));
  }

  /* ── Download run as CSV ── */
  private _downloadRun(run: DeviceRun) {
    const header = [run.fields.join(','), run.units.join(',')];
    const dataRows = run.rows.map(r => r.join(','));
    const blob = new Blob([[...header, ...dataRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `run_${run.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Styles ── */
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
      max-width: 560px;
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
      max-width: 560px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .alert {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 11px 14px;
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

    .sync-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .btn-sync {
      font-family: var(--sans);
      font-size: 0.875rem;
      font-weight: 500;
      padding: 10px 28px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      background: var(--fg);
      color: #09090b;
      transition: opacity 0.15s;
    }

    .btn-sync:hover:not(:disabled) { opacity: 0.88; }
    .btn-sync:disabled { opacity: 0.3; cursor: not-allowed; }

    .sync-status {
      font-family: var(--mono);
      font-size: 0.72rem;
    }

    .sync-status.listing,
    .sync-status.downloading { color: #a1a1aa; animation: blink 0.8s infinite; }
    .sync-status.done  { color: #22c55e; }
    .sync-status.error { color: #f87171; }

    @keyframes blink { 50% { opacity: 0.4; } }

    .runs-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .run-item {
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
    }

    .run-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 11px 14px;
      cursor: pointer;
      user-select: none;
      transition: background 0.12s;
    }

    .run-header:hover { background: #18181b; }

    .run-id {
      font-family: var(--mono);
      font-size: 0.8rem;
      color: var(--fg);
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .run-meta {
      font-family: var(--mono);
      font-size: 0.65rem;
      color: var(--muted-fg);
      white-space: nowrap;
    }

    .run-chevron {
      font-size: 0.85rem;
      color: var(--muted-fg);
      transition: transform 0.15s;
      flex-shrink: 0;
    }

    .run-chevron.open { transform: rotate(90deg); }

    .run-detail {
      border-top: 1px solid var(--border);
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .run-detail-row {
      display: flex;
      gap: 8px;
      font-size: 0.7rem;
    }

    .run-detail-key {
      font-family: var(--mono);
      color: var(--muted-fg);
      flex-shrink: 0;
      min-width: 80px;
    }

    .run-detail-val {
      font-family: var(--mono);
      color: var(--fg);
    }

    .run-actions {
      border-top: 1px solid var(--border);
      display: flex;
      gap: 8px;
      padding: 10px 14px;
    }

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
    }

    .btn-sm:hover { border-color: #52525b; color: var(--fg); }
    .btn-sm.danger:hover { border-color: #ef4444; color: #f87171; }

    .empty-msg {
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--muted-fg);
      text-align: center;
      padding: 28px 0;
    }
  `;

  render() {
    const busy = this.syncStatus === 'listing' || this.syncStatus === 'downloading';

    return html`
      <main>
        <div class="page-header">
          <a class="back-btn" href="${resolveRouterPath()}">←</a>
          <span class="page-title">Sync Logs</span>
        </div>

        <div class="content">

          ${!this.connected ? html`
            <div class="alert">
              <span>Device not connected</span>
              <a href="${resolveRouterPath('connect')}">Connect →</a>
            </div>
          ` : ''}

          <!-- Sync card -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">Device Sync</span>
            </div>
            <div class="sync-row">
              <button class="btn-sync"
                ?disabled=${!this.connected || busy}
                @click=${this._sync}>
                ${busy ? 'Syncing…' : 'Sync'}
              </button>
              ${this.syncStatus !== 'idle' ? html`
                <span class="sync-status ${this.syncStatus}">
                  ${this.syncStatus === 'listing'     ? 'Listing runs on device…'
                  : this.syncStatus === 'downloading' ? `Downloading… ${this.syncProgress}`
                  : this.syncMsg}
                </span>
              ` : ''}
            </div>
          </div>

          <!-- Local runs -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">Downloaded Runs (${this.runs.length})</span>
            </div>
            ${this.runs.length === 0
              ? html`<div class="empty-msg">No runs downloaded yet. Connect to device and press Sync.</div>`
              : html`
                <div class="runs-list">
                  ${this.runs.map(run => {
                    const open = this.expandedId === run.id;
                    const startDate = run.meta.startTime
                      ? new Date(run.meta.startTime).toLocaleString()
                      : '—';
                    return html`
                      <div class="run-item">
                        <div class="run-header"
                          @click=${() => { this.expandedId = open ? null : run.id; }}>
                          <span class="run-id">Run #${run.id}</span>
                          <span class="run-meta">${run.rows.length} rows · ${new Date(run.downloadedAt).toLocaleDateString()}</span>
                          <span class="run-chevron ${open ? 'open' : ''}">›</span>
                        </div>
                        ${open ? html`
                          <div class="run-detail">
                            <div class="run-detail-row">
                              <span class="run-detail-key">Start</span>
                              <span class="run-detail-val">${startDate}</span>
                            </div>
                            <div class="run-detail-row">
                              <span class="run-detail-key">Interval</span>
                              <span class="run-detail-val">${run.meta.interval} ms</span>
                            </div>
                            ${run.meta.tagId ? html`
                              <div class="run-detail-row">
                                <span class="run-detail-key">Tag ID</span>
                                <span class="run-detail-val">${run.meta.tagId}</span>
                              </div>` : ''}
                            ${run.meta.lat ? html`
                              <div class="run-detail-row">
                                <span class="run-detail-key">Location</span>
                                <span class="run-detail-val">${run.meta.lat}, ${run.meta.lon}</span>
                              </div>` : ''}
                            <div class="run-detail-row">
                              <span class="run-detail-key">Fields</span>
                              <span class="run-detail-val">${run.fields.join(', ')}</span>
                            </div>
                          </div>
                          <div class="run-actions">
                            <button class="btn-sm" @click=${() => this._downloadRun(run)}>Download CSV</button>
                            <button class="btn-sm danger" @click=${() => deleteDeviceRun(run.id)}>Delete</button>
                          </div>
                        ` : ''}
                      </div>
                    `;
                  })}
                </div>
              `
            }
          </div>

        </div>
      </main>
    `;
  }
}
