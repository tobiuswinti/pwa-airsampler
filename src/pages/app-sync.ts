import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import { bleService } from '../ble-service';
import {
  DeviceRun,
  getDeviceRuns,
  hasDeviceRunByRunId,
  saveDeviceRun,
  onDeviceRunsChanged,
  parseMeta,
  applyCarryForward,
} from '../device-log-store';
import { uploadPendingRuns } from '../run-upload-service';

type SyncStatus = 'idle' | 'listing' | 'downloading' | 'done' | 'error';

@customElement('app-sync')
export class AppSync extends LitElement {

  @state() private connected  = bleService.connStatus === 'connected';
  @state() private runs: DeviceRun[] = getDeviceRuns();
  @state() private deviceOnlyRuns: Array<{idx: number; runId: string; tagId: string; startTime: number}> = [];
  @state() private syncStatus: SyncStatus = 'idle';
  @state() private syncMsg      = '';
  @state() private syncTotal    = 0;
  @state() private syncDone     = 0;

  private _onStatus    = () => {
    this.connected = bleService.connStatus === 'connected';
  };
  private _onSyncCheck = () => {
    this.deviceOnlyRuns = bleService.deviceRuns.filter(r => {
      if (r.runId) return !hasDeviceRunByRunId(r.runId);
      return !getDeviceRuns().some(local => local.id === r.idx);
    });
  };
  private _unsub?: () => void;

  connectedCallback() {
    super.connectedCallback();
    bleService.addEventListener('status-changed',     this._onStatus);
    bleService.addEventListener('sync-check-changed', this._onSyncCheck);
    this._unsub = onDeviceRunsChanged(() => {
      this.runs = getDeviceRuns();
      this._onSyncCheck();
    });
    this._onSyncCheck();
    if (this.connected) {
      Promise.resolve().then(() => this._sync());
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    bleService.removeEventListener('status-changed',     this._onStatus);
    bleService.removeEventListener('sync-check-changed', this._onSyncCheck);
    this._unsub?.();
  }

  // ── Device sync ───────────────────────────────────────────────────────

  private _tryJson(line: string): Record<string, unknown> | null {
    const t = line.trim();
    if (!t.startsWith('{')) return null;
    try { return JSON.parse(t); } catch { return null; }
  }

  private _findError(lines: string[]): string | null {
    for (const l of lines) { if (l.startsWith('ERROR')) return l; }
    return null;
  }

  private async _sync() {
    if (this.syncStatus === 'listing' || this.syncStatus === 'downloading') return;
    if (!this.connected) return;
    this.syncStatus = 'listing'; this.syncMsg = '';
    this.syncTotal = 0; this.syncDone = 0;

    const listLines = await bleService.sendCmd('listRuns');
    const listErr   = this._findError(listLines);
    if (listErr) { this.syncStatus = 'error'; this.syncMsg = listErr; return; }

    const deviceRuns: Array<{idx: number; runId: string; tagId: string; startTime: number}> = [];
    for (const l of listLines) {
      const j = this._tryJson(l);
      if (j?.['run']) {
        const r = j['run'] as Record<string, unknown>;
        deviceRuns.push({
          idx:       Number(r['idx']       ?? 0),
          runId:     String(r['runId']      ?? ''),
          tagId:     String(r['tagId']      ?? ''),
          startTime: Number(r['startTime']  ?? 0),
        });
      }
    }

    if (deviceRuns.length === 0) {
      this.syncStatus = 'done'; this.syncMsg = 'No runs on device.'; return;
    }

    const toDownload = deviceRuns.filter(r =>
      r.runId ? !hasDeviceRunByRunId(r.runId) : !getDeviceRuns().some(local => local.id === r.idx)
    );
    if (toDownload.length === 0) {
      this.syncStatus = 'done'; this.syncMsg = 'Already up to date.'; return;
    }

    this.syncStatus = 'downloading';
    this.syncTotal  = toDownload.length;
    this.syncDone   = 0;

    for (const r of toDownload) {
      const logLines = await bleService.sendCmd(`getStateLogs -run ${r.idx}`);
      const logErr   = this._findError(logLines);
      if (logErr) { this.syncStatus = 'error'; this.syncMsg = `Run ${r.idx}: ${logErr}`; return; }

      const dataLines = logLines.filter(l => { const t = l.trim(); return t !== '' && !t.startsWith('{'); });
      if (dataLines.length < 3) {
        this.syncStatus = 'error'; this.syncMsg = `Run ${r.idx}: not enough data`; return;
      }

      const fields = ['timestamp', ...dataLines[0].split(',')];
      const units  = ['ms',        ...dataLines[1].split(',')];
      const meta   = parseMeta(dataLines[2]);
      const rows   = applyCarryForward(dataLines.slice(3).map(l => l.split(','))).map((row, i) => [
        String(meta.startTime + i * meta.interval), ...row,
      ]);

      saveDeviceRun({ id: r.idx, downloadedAt: Date.now(), fields, units, meta, rows });
      this.syncDone++;
    }

    this.syncStatus = 'done';
    this.syncMsg    = `Downloaded ${toDownload.length} run${toDownload.length !== 1 ? 's' : ''}.`;
    bleService.unsyncedCount = 0;
    bleService.dispatchEvent(new CustomEvent('sync-check-changed'));
    uploadPendingRuns();
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private _fmt(ms: number) {
    return ms ? new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  }

  private _renderRun(run: DeviceRun) {
    const uploaded = !!run.firebaseId;
    const errored  = !!run.uploadError;
    return html`
      <div class="run-item">
        <div class="run-info">
          <span class="run-name">${run.meta?.tagId || `Run #${run.id}`}</span>
          <span class="run-date">${this._fmt(run.meta?.startTime)}</span>
        </div>
        <div class="run-actions">
          ${uploaded
            ? html`<span class="cloud-badge cloud-ok" title="Uploaded to cloud">☁</span>`
            : errored
              ? html`<span class="cloud-badge cloud-err" title="${run.uploadError}">!</span>`
              : html`<span class="cloud-badge cloud-pending" title="Pending upload">↑</span>`}
          <a class="btn-sm" href="#run/${run.id}">View</a>
        </div>
      </div>`;
  }

  private _renderDeviceOnlyRun(r: {idx: number; tagId: string; startTime: number}) {
    return html`
      <div class="run-item run-item--dimmed">
        <div class="run-info">
          <span class="run-name">${r.tagId || `Run #${r.idx}`}</span>
          <span class="run-date">${r.startTime ? new Date(r.startTime * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</span>
        </div>
      </div>`;
  }

  // ── Styles ────────────────────────────────────────────────────────────

  static styles = css`
    :host {
      --bg:       #09090b;
      --card:     #111113;
      --border:   #3f3f46;
      --fg:       #fafafa;
      --muted-fg: #a1a1aa;
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
      border-radius: 8px;
      background: transparent;
      color: var(--muted-fg);
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
      text-decoration: none;
      font-size: 1rem;
    }

    .back-btn:hover { color: var(--fg); border-color: #52525b; }

    .page-title {
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--fg);
      letter-spacing: -0.01em;
    }

    .content {
      width: 100%;
      max-width: 560px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    /* ── Connect banner ── */
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

    /* ── Download action card ── */
    .action-card {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
      user-select: none;
    }

    .action-card:hover:not(.action-card--busy) { background: #18181b; border-color: #52525b; }
    .action-card--busy   { cursor: default; border-color: rgba(245,158,11,0.3); }
    .action-card--done   { border-color: rgba(34,197,94,0.3); }
    .action-card--error  { border-color: rgba(239,68,68,0.3); }

    .action-icon {
      width: 38px; height: 38px;
      border-radius: 10px;
      background: rgba(255,255,255,0.06);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }

    .action-icon svg { width: 18px; height: 18px; }

    .action-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .action-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--fg);
      letter-spacing: -0.01em;
    }

    .action-desc {
      font-size: 0.75rem;
      color: var(--muted-fg);
    }

    .action-desc.ok      { color: #22c55e; }
    .action-desc.error   { color: #f87171; }
    .action-desc.busy    { color: #f59e0b; }

    .action-right {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      color: var(--muted-fg);
    }

    .progress-ring {
      width: 22px; height: 22px;
    }

    .spinner {
      width: 18px; height: 18px;
      border: 2px solid #3f3f46;
      border-top-color: #f59e0b;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Section card ── */
    .section-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 13px 16px;
      border-bottom: 1px solid var(--border);
    }

    .section-title {
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--muted-fg);
    }

    .section-count {
      font-family: var(--mono);
      font-size: 0.7rem;
      color: #52525b;
    }

    /* ── Run items ── */
    .runs-list { display: flex; flex-direction: column; }

    .run-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid #1c1c1f;
      color: var(--fg);
    }

    .run-item:last-child { border-bottom: none; }
    .run-item--dimmed { opacity: 0.4; }

    .run-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }

    .run-name {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--fg);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .run-date {
      font-family: var(--mono);
      font-size: 0.6875rem;
      color: var(--muted-fg);
    }

    .run-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

    .cloud-badge {
      font-size: 0.65rem;
      font-weight: 700;
      width: 18px; height: 18px;
      border-radius: 5px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }

    .cloud-ok      { color: #22c55e; background: rgba(34,197,94,0.1);   border: 1px solid rgba(34,197,94,0.25); }
    .cloud-pending { color: #71717a; background: rgba(113,113,122,0.1); border: 1px solid rgba(113,113,122,0.2); }
    .cloud-err     { color: #f87171; background: rgba(239,68,68,0.1);   border: 1px solid rgba(239,68,68,0.25); }

    .btn-sm {
      font-family: var(--sans);
      font-size: 0.75rem;
      font-weight: 500;
      padding: 5px 12px;
      border-radius: 6px;
      cursor: pointer;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--muted-fg);
      text-decoration: none;
      transition: border-color 0.15s, color 0.15s;
      white-space: nowrap;
    }

    .btn-sm:hover { border-color: #52525b; color: var(--fg); }

    .empty-msg {
      font-size: 0.8125rem;
      color: var(--muted-fg);
      text-align: center;
      padding: 28px 16px;
    }
  `;

  // ── Render ────────────────────────────────────────────────────────────

  render() {
    const busy       = this.syncStatus === 'listing' || this.syncStatus === 'downloading';
    const localRuns  = this.runs;

    // Action card appearance
    let actionClass = 'action-card';
    let actionDesc  = '';
    let descClass   = '';
    let rightEl;

    if (busy) {
      actionClass += ' action-card--busy';
      descClass = 'busy';
      if (this.syncStatus === 'listing') {
        actionDesc = 'Listing runs on device…';
      } else {
        actionDesc = `Downloading ${this.syncDone} of ${this.syncTotal}…`;
      }
      rightEl = html`<div class="spinner"></div>`;
    } else if (this.syncStatus === 'done') {
      actionClass += ' action-card--done';
      actionDesc = this.syncMsg;
      descClass  = 'ok';
      rightEl = html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#22c55e" stroke-width="1.5"/><path d="M8 12l3 3 5-5" stroke="#22c55e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    } else if (this.syncStatus === 'error') {
      actionClass += ' action-card--error';
      actionDesc = this.syncMsg;
      descClass  = 'error';
      rightEl = html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#ef4444" stroke-width="1.5"/><path d="M12 8v4M12 16h.01" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    } else {
      actionDesc = this.connected ? 'Fetch new runs from device' : 'Connect a device to download';
      rightEl = html`<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="opacity:0.3"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`;
    }

    return html`
      <main>
        <div class="page-header">
          <a class="back-btn" href="${resolveRouterPath()}">←</a>
          <span class="page-title">Download Sample Data</span>
        </div>

        <div class="content">

          ${!this.connected ? html`
            <a class="connect-banner" href="${resolveRouterPath('connect')}">
              <div class="cb-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#93c5fd">
                  <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3a4.237 4.237 0 00-6 0zm-4-4l2 2a7.074 7.074 0 0110 0l2-2C15.14 9.14 8.87 9.14 5 13z"/>
                </svg>
              </div>
              <span class="cb-label">Connect to device to download runs</span>
              <span class="cb-arrow">›</span>
            </a>
          ` : ''}

          <!-- Download action -->
          <div class="${actionClass}" @click=${() => !busy && this._sync()}>
            <div class="action-icon">
              <svg viewBox="0 0 24 24" fill="#a1a1aa">
                <path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
              </svg>
            </div>
            <div class="action-text">
              <span class="action-label">Download Sample Data</span>
              <span class="action-desc ${descClass}">${actionDesc}</span>
            </div>
            <div class="action-right">${rightEl}</div>
          </div>

          <!-- On device (not yet downloaded) -->
          ${this.connected && this.deviceOnlyRuns.length > 0 ? html`
            <div class="section-card">
              <div class="section-header">
                <span class="section-title">On Device</span>
                <span class="section-count">${this.deviceOnlyRuns.length}</span>
              </div>
              <div class="runs-list">
                ${this.deviceOnlyRuns.map(r => this._renderDeviceOnlyRun(r))}
              </div>
            </div>
          ` : ''}

          <!-- Downloaded runs -->
          <div class="section-card">
            <div class="section-header">
              <span class="section-title">Downloaded</span>
              <span class="section-count">${localRuns.length}</span>
            </div>
            ${localRuns.length === 0
              ? html`<div class="empty-msg">No runs downloaded yet.</div>`
              : html`<div class="runs-list">${localRuns.map(r => this._renderRun(r))}</div>`
            }
          </div>

        </div>
      </main>
    `;
  }
}
