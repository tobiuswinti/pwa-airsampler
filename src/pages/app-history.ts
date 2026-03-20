import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import { getAllLogs, deleteLog, type HistoryEntry } from '../history-store';
import { setLogData, setAboutData, parseLogLines } from '../log-store';

@customElement('app-history')
export class AppHistory extends LitElement {
  @state() private entries: HistoryEntry[] = [];
  @state() private loading = true;
  @state() private error = '';

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  private async _load() {
    this.loading = true;
    this.error = '';
    try {
      this.entries = await getAllLogs();
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : 'Failed to load history';
    } finally {
      this.loading = false;
    }
  }

  private async _delete(id: string) {
    if (!confirm('Delete this log entry?')) return;
    try {
      await deleteLog(id);
      this.entries = this.entries.filter((e) => e.id !== id);
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : 'Failed to delete';
    }
  }

  private _view(entry: HistoryEntry) {
    const rows = parseLogLines(entry.rawLines);
    setLogData(rows, entry.rawLines);
    if (entry.about) setAboutData(entry.about);
    window.location.hash = '#log';
  }

  private _formatDate(d: Date): string {
    return d.toLocaleString('de-CH', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

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
      border: 2px solid var(--warn);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 12px rgba(255,107,53,0.4);
      flex-shrink: 0;
    }

    .logo-icon svg { width: 18px; height: 18px; fill: var(--warn); }

    .page-title {
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--warn);
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
      background: linear-gradient(90deg, transparent, var(--warn), transparent);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 14px;
    }

    .card-title {
      font-family: var(--mono);
      font-size: 0.72rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--warn);
    }

    .card-date {
      font-family: var(--mono);
      font-size: 0.68rem;
      color: var(--muted);
    }

    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 16px;
    }

    .meta-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .meta-label {
      font-family: var(--mono);
      font-size: 0.58rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .meta-value {
      font-family: var(--mono);
      font-size: 0.78rem;
      color: var(--accent);
      word-break: break-all;
    }

    .card-actions {
      display: flex;
      gap: 10px;
    }

    .btn {
      font-family: var(--display);
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 8px 18px;
      border-radius: 7px;
      border: none;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.15s;
    }

    .btn:hover { opacity: 0.88; transform: translateY(-1px); }

    .btn-view {
      background: var(--ok);
      color: var(--bg);
    }

    .btn-delete {
      background: transparent;
      border: 1px solid rgba(255,107,53,0.4);
      color: var(--warn);
    }

    .btn-delete:hover { border-color: var(--warn); }

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

    .error-msg {
      font-family: var(--mono);
      font-size: 0.78rem;
      color: var(--warn);
      text-align: center;
      padding: 20px;
    }

    .loading-msg {
      font-family: var(--mono);
      font-size: 0.78rem;
      color: var(--muted);
      text-align: center;
      padding: 40px 20px;
    }

    .entry-count {
      font-family: var(--mono);
      font-size: 0.65rem;
      color: var(--muted);
    }

    @media (max-width: 480px) {
      .card { padding: 16px; }
      .meta-grid { grid-template-columns: 1fr; }
    }
  `;

  render() {
    return html`
      <main>
        <div class="page-header">
          <div class="logo-icon">
            <svg viewBox="0 0 24 24"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0013 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
          </div>
          <span class="page-title">History</span>
        </div>

        <div class="content">
          ${this.error ? html`<div class="error-msg">${this.error}</div>` : ''}

          ${this.loading
            ? html`<div class="loading-msg">Loading history...</div>`
            : this.entries.length === 0
              ? html`
                  <div class="empty-msg">
                    No uploaded logs yet. Go to the Log Viewer and upload a log to see it here.
                  </div>
                `
              : html`
                  <div class="entry-count">${this.entries.length} log${this.entries.length !== 1 ? 's' : ''} uploaded</div>
                  ${this.entries.map((entry) => this._renderEntry(entry))}
                `}

          <div>
            <a class="nav-back" href="${resolveRouterPath()}">← Home</a>
          </div>
        </div>
      </main>
    `;
  }

  private _renderEntry(entry: HistoryEntry) {
    const about = entry.about;
    return html`
      <div class="card">
        <div class="card-header">
          <span class="card-title">Log — ${entry.rowCount} rows</span>
          <span class="card-date">${this._formatDate(entry.uploadedAt)}</span>
        </div>

        ${about ? html`
          <div class="meta-grid">
            ${about.rfidTag ? html`
              <div class="meta-item">
                <span class="meta-label">RFID Tag</span>
                <span class="meta-value">${about.rfidTag}</span>
              </div>
            ` : ''}
            ${about.deviceName ? html`
              <div class="meta-item">
                <span class="meta-label">Device</span>
                <span class="meta-value">${about.deviceName}</span>
              </div>
            ` : ''}
            ${about.gpsLat && about.gpsLng ? html`
              <div class="meta-item">
                <span class="meta-label">GPS</span>
                <span class="meta-value">${about.gpsLat}, ${about.gpsLng}</span>
              </div>
            ` : ''}
            ${about.logStart ? html`
              <div class="meta-item">
                <span class="meta-label">Log Start</span>
                <span class="meta-value">${about.logStart}</span>
              </div>
            ` : ''}
            ${about.logEnd ? html`
              <div class="meta-item">
                <span class="meta-label">Log End</span>
                <span class="meta-value">${about.logEnd}</span>
              </div>
            ` : ''}
          </div>
        ` : ''}

        <div class="card-actions">
          <button class="btn btn-view" @click=${() => this._view(entry)}>View</button>
          <button class="btn btn-delete" @click=${() => this._delete(entry.id)}>Delete</button>
        </div>
      </div>
    `;
  }
}
