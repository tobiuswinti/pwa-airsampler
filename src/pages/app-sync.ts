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
} from '../device-log-store';

type SyncStatus = 'idle' | 'listing' | 'downloading' | 'done' | 'error';

@customElement('app-sync')
export class AppSync extends LitElement {

  @state() private connected = bleService.connStatus === 'connected';
  @state() private runs: DeviceRun[] = getDeviceRuns();

  @state() private syncStatus: SyncStatus = 'idle';
  @state() private syncMsg = '';
  @state() private syncProgress = '';   // e.g. "2 / 5"
  @state() private expandedId: string | null = null;

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

  /* ── Sync ── */
  private async _sync() {
    if (this.syncStatus === 'listing' || this.syncStatus === 'downloading') return;
    this.syncStatus = 'listing';
    this.syncMsg = '';
    this.syncProgress = '';

    // 1. List all run IDs on the device
    const listLines = await bleService.sendCmd('listRuns');
    if (!listLines.some(l => l.startsWith('OK'))) {
      this.syncStatus = 'error';
      this.syncMsg = listLines[0] ?? 'listRuns failed';
      return;
    }

    // Lines between ACK/DONE that are not "OK" are run IDs
    const deviceIds = listLines.filter(l => !l.startsWith('OK'));

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
    this.syncStatus = 'downloading';
    let done = 0;
    for (const id of toDownload) {
      this.syncProgress = `${done} / ${toDownload.length}`;
      const logLines = await bleService.sendCmd(`getLog -run ${id}`);
      if (!logLines.some(l => l.startsWith('OK'))) {
        this.syncStatus = 'error';
        this.syncMsg = `Failed to download run "${id}": ${logLines[0] ?? 'unknown error'}`;
        return;
      }
      const lines = logLines.filter(l => !l.startsWith('OK'));
      saveDeviceRun({ id, downloadedAt: Date.now(), lines });
      done++;
      this.syncProgress = `${done} / ${toDownload.length}`;
    }

    this.syncStatus = 'done';
    this.syncMsg = `Downloaded ${toDownload.length} new run(s). Total: ${deviceIds.length}.`;
    this.syncProgress = '';
  }

  /* ── Download run as CSV ── */
  private _downloadRun(run: DeviceRun) {
    const blob = new Blob([run.lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${run.id}.csv`;
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
      border: 2px solid var(--accent2);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 12px rgba(124,58,237,0.4);
      flex-shrink: 0;
    }

    .logo-icon svg { width: 18px; height: 18px; fill: var(--accent2); }

    .page-title {
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--accent2);
    }

    .content {
      width: 100%;
      max-width: 640px;
      padding: 28px 20px;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .disconnected-notice {
      background: rgba(255,107,53,0.06);
      border: 1px solid rgba(255,107,53,0.3);
      border-radius: 12px;
      padding: 14px 18px;
      font-size: 0.82rem;
      line-height: 1.65;
      color: #e2a98a;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .disconnected-notice a {
      color: var(--accent);
      text-decoration: none;
      font-family: var(--mono);
      font-size: 0.75rem;
      border: 1px solid var(--accent);
      padding: 4px 10px;
      border-radius: 5px;
      white-space: nowrap;
    }

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
      background: linear-gradient(90deg, transparent, var(--accent2), transparent);
    }

    .card-title {
      font-family: var(--mono);
      font-size: 0.72rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--accent2);
      margin-bottom: 16px;
    }

    .sync-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .btn-sync {
      font-family: var(--display);
      font-size: 0.85rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      padding: 13px 36px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      background: linear-gradient(135deg, var(--accent2), var(--accent));
      color: #fff;
      transition: opacity 0.2s, transform 0.15s;
      box-shadow: 0 0 20px rgba(124,58,237,0.2);
    }

    .btn-sync:hover:not(:disabled)  { opacity: 0.88; transform: translateY(-1px); }
    .btn-sync:disabled { opacity: 0.3; cursor: not-allowed; }

    .sync-status {
      font-family: var(--mono);
      font-size: 0.72rem;
      letter-spacing: 0.04em;
    }

    .sync-status.listing   { color: var(--accent); }
    .sync-status.downloading { color: var(--accent); animation: blink 0.8s infinite; }
    .sync-status.done      { color: var(--ok); }
    .sync-status.error     { color: var(--warn); }

    @keyframes blink { 50% { opacity: 0.4; } }

    .runs-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .run-item {
      background: rgba(255,255,255,0.02);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
    }

    .run-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 13px 16px;
      cursor: pointer;
      user-select: none;
      transition: background 0.15s;
    }

    .run-header:hover { background: rgba(255,255,255,0.03); }

    .run-id {
      font-family: var(--mono);
      font-size: 0.8rem;
      color: var(--text);
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .run-meta {
      font-family: var(--mono);
      font-size: 0.62rem;
      color: var(--muted);
      white-space: nowrap;
    }

    .run-chevron {
      font-size: 0.9rem;
      color: var(--muted);
      transition: transform 0.2s;
      flex-shrink: 0;
    }

    .run-chevron.open { transform: rotate(90deg); }

    .run-actions {
      display: flex;
      gap: 8px;
      padding: 0 16px 14px;
      flex-wrap: wrap;
    }

    .btn-sm {
      font-family: var(--mono);
      font-size: 0.68rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 6px 14px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted);
    }

    .btn-sm:hover { border-color: var(--accent); color: var(--accent); }

    .btn-sm.danger:hover { border-color: var(--warn); color: var(--warn); }

    .run-preview {
      padding: 0 16px 14px;
      font-family: var(--mono);
      font-size: 0.62rem;
      color: var(--muted);
      line-height: 1.6;
      max-height: 120px;
      overflow-y: auto;
      border-top: 1px solid var(--border);
      padding-top: 10px;
    }

    .empty-msg {
      font-family: var(--mono);
      font-size: 0.78rem;
      color: var(--muted);
      text-align: center;
      padding: 32px 16px;
    }

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
  `;

  render() {
    const busy = this.syncStatus === 'listing' || this.syncStatus === 'downloading';

    return html`
      <main>
        <div class="page-header">
          <div class="logo-icon">
            <svg viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
          </div>
          <span class="page-title">Sync Logs</span>
        </div>

        <div class="content">

          ${!this.connected ? html`
            <div class="disconnected-notice">
              <span>Device not connected.</span>
              <a href="${resolveRouterPath('connect')}">Go to Connect →</a>
            </div>
          ` : ''}

          <!-- Sync card -->
          <div class="card">
            <div class="card-title">Device Sync</div>
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
            <div class="card-title">Downloaded Runs (${this.runs.length})</div>
            ${this.runs.length === 0
              ? html`<div class="empty-msg">No runs downloaded yet. Connect to device and press Sync.</div>`
              : html`
                <div class="runs-list">
                  ${this.runs.map(run => html`
                    <div class="run-item">
                      <div class="run-header"
                        @click=${() => { this.expandedId = this.expandedId === run.id ? null : run.id; }}>
                        <span class="run-id">${run.id}</span>
                        <span class="run-meta">${run.lines.length} lines · ${new Date(run.downloadedAt).toLocaleDateString()}</span>
                        <span class="run-chevron ${this.expandedId === run.id ? 'open' : ''}">›</span>
                      </div>
                      ${this.expandedId === run.id ? html`
                        <div class="run-preview">
                          ${run.lines.slice(0, 20).map(l => html`${l}<br>`)}
                          ${run.lines.length > 20 ? html`… (${run.lines.length - 20} more lines)` : ''}
                        </div>
                        <div class="run-actions">
                          <button class="btn-sm" @click=${() => this._downloadRun(run)}>Download CSV</button>
                          <button class="btn-sm danger" @click=${() => deleteDeviceRun(run.id)}>Delete</button>
                        </div>
                      ` : ''}
                    </div>
                  `)}
                </div>
              `
            }
          </div>

          <div><a class="nav-back" href="${resolveRouterPath()}">← Back to Home</a></div>

        </div>
      </main>
    `;
  }
}
