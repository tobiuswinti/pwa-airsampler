import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import { authService } from '../auth-service';
import {
  collection, query, getDocs, deleteDoc, doc,
  orderBy, limit, startAfter, QueryDocumentSnapshot,
  DocumentData, Timestamp, where,
} from 'firebase/firestore';
import { db } from '../firebase';

const COLLECTION = 'device_runs';
const PAGE_SIZE   = 25;

interface CloudRun {
  id:          string;
  tagId:       string;
  startTime:   number;
  uploadedAt:  number;
  lat:         string;
  lon:         string;
}

@customElement('app-admin-runs')
export class AppAdminRuns extends LitElement {

  @state() private _runs:    CloudRun[] = [];
  @state() private _loading  = true;
  @state() private _loadingMore = false;
  @state() private _hasMore  = false;
  @state() private _error    = '';
  @state() private _search   = '';
  @state() private _deleting = new Set<string>();

  private _lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;

  connectedCallback() {
    super.connectedCallback();
    if (!authService.isAdmin) {
      window.location.href = resolveRouterPath();
      return;
    }
    this._load();
  }

  private async _load() {
    this._loading = true;
    this._error   = '';
    this._runs    = [];
    this._lastDoc = null;
    try {
      const q    = query(collection(db, COLLECTION), orderBy('startTime', 'desc'), limit(PAGE_SIZE));
      const snap = await getDocs(q);
      this._runs    = snap.docs.map(d => this._toRun(d));
      this._lastDoc = snap.docs[snap.docs.length - 1] ?? null;
      this._hasMore = snap.docs.length === PAGE_SIZE;
    } catch (e: any) {
      this._error = e.message ?? 'Failed to load runs.';
    } finally {
      this._loading = false;
    }
  }

  private async _loadMore() {
    if (!this._lastDoc || this._loadingMore) return;
    this._loadingMore = true;
    try {
      const q    = query(collection(db, COLLECTION), orderBy('startTime', 'desc'), limit(PAGE_SIZE), startAfter(this._lastDoc));
      const snap = await getDocs(q);
      this._runs    = [...this._runs, ...snap.docs.map(d => this._toRun(d))];
      this._lastDoc = snap.docs[snap.docs.length - 1] ?? null;
      this._hasMore = snap.docs.length === PAGE_SIZE;
    } catch { /* ignore */ } finally {
      this._loadingMore = false;
    }
  }

  private async _search_cloud() {
    const tag = this._search.trim();
    if (!tag) { this._load(); return; }
    this._loading = true;
    this._error   = '';
    try {
      const q    = query(collection(db, COLLECTION), where('tagId', '==', tag), orderBy('startTime', 'desc'), limit(PAGE_SIZE));
      const snap = await getDocs(q);
      this._runs    = snap.docs.map(d => this._toRun(d));
      this._lastDoc = null;
      this._hasMore = false;
    } catch (e: any) {
      this._error = e.message ?? 'Search failed.';
    } finally {
      this._loading = false;
    }
  }

  private async _delete(id: string) {
    this._deleting = new Set([...this._deleting, id]);
    try {
      await deleteDoc(doc(db, COLLECTION, id));
      this._runs = this._runs.filter(r => r.id !== id);
    } catch { /* ignore */ } finally {
      const s = new Set(this._deleting);
      s.delete(id);
      this._deleting = s;
    }
  }

  private _toRun(d: QueryDocumentSnapshot<DocumentData>): CloudRun {
    const data = d.data();
    const rawStart = Number(data['startTime'] ?? 0);
    const uploadedAt = data['uploadedAt'] instanceof Timestamp
      ? data['uploadedAt'].toMillis() : Number(data['uploadedAt'] ?? 0);
    const meta = (data['meta'] ?? {}) as Record<string, string>;
    return {
      id:         d.id,
      tagId:      String(data['tagId'] ?? ''),
      startTime:  rawStart < 1e12 ? rawStart * 1000 : rawStart,
      uploadedAt,
      lat:        String(meta['lat'] ?? ''),
      lon:        String(meta['lon'] ?? ''),
    };
  }

  private _fmt(ms: number) {
    return ms ? new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  }

  private _hasLocation(r: CloudRun) {
    const lat = parseFloat(r.lat), lon = parseFloat(r.lon);
    return !isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0);
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
      border-radius: 8px;
      background: transparent;
      color: var(--muted-fg);
      text-decoration: none;
      font-size: 1rem;
      transition: color 0.15s, border-color 0.15s;
    }

    .back-btn:hover { color: var(--fg); border-color: #52525b; }

    .page-title {
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--fg);
      letter-spacing: -0.01em;
      flex: 1;
    }

    .run-count {
      font-family: var(--mono);
      font-size: 0.75rem;
      color: #52525b;
    }

    .content {
      width: 100%;
      max-width: 600px;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    /* ── Search bar ── */
    .search-row {
      display: flex;
      gap: 8px;
    }

    .search-input {
      flex: 1;
      font-family: var(--mono);
      font-size: 0.875rem;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #0d0d0f;
      color: var(--fg);
      outline: none;
      transition: border-color 0.15s;
    }

    .search-input::placeholder { color: #3f3f46; }
    .search-input:focus { border-color: #52525b; }

    .btn-search {
      font-family: var(--sans);
      font-size: 0.8125rem;
      font-weight: 500;
      padding: 10px 16px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted-fg);
      cursor: pointer;
      white-space: nowrap;
      transition: border-color 0.15s, color 0.15s;
    }

    .btn-search:hover { border-color: #52525b; color: var(--fg); }

    .btn-clear {
      font-family: var(--sans);
      font-size: 0.8125rem;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted-fg);
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s;
    }

    .btn-clear:hover { border-color: #52525b; color: var(--fg); }

    /* ── Runs card ── */
    .runs-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
    }

    /* ── Run row ── */
    .run-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 13px 16px;
      border-bottom: 1px solid #1c1c1f;
    }

    .run-row:last-child { border-bottom: none; }

    .run-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .run-tag {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--fg);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .run-meta {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .run-date {
      font-family: var(--mono);
      font-size: 0.6875rem;
      color: var(--muted-fg);
    }

    .run-loc {
      font-family: var(--mono);
      font-size: 0.6875rem;
      color: #52525b;
    }

    .run-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .btn-sm {
      font-family: var(--sans);
      font-size: 0.75rem;
      font-weight: 500;
      padding: 5px 12px;
      border-radius: 6px;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--muted-fg);
      text-decoration: none;
      cursor: pointer;
      white-space: nowrap;
      transition: border-color 0.15s, color 0.15s;
    }

    .btn-sm:hover { border-color: #52525b; color: var(--fg); }

    .btn-delete {
      font-family: var(--sans);
      font-size: 0.75rem;
      font-weight: 500;
      padding: 5px 12px;
      border-radius: 6px;
      background: transparent;
      border: 1px solid rgba(239,68,68,0.2);
      color: #71717a;
      cursor: pointer;
      white-space: nowrap;
      transition: border-color 0.15s, color 0.15s;
    }

    .btn-delete:hover:not(:disabled) { border-color: rgba(239,68,68,0.5); color: #f87171; }
    .btn-delete:disabled { opacity: 0.3; cursor: default; }

    /* ── States ── */
    .state-msg {
      text-align: center;
      padding: 40px 20px;
      font-size: 0.875rem;
      color: var(--muted-fg);
    }

    .error-msg {
      text-align: center;
      padding: 20px;
      font-family: var(--mono);
      font-size: 0.75rem;
      color: #f87171;
    }

    .spinner {
      display: block;
      width: 22px; height: 22px;
      border: 2px solid #3f3f46;
      border-top-color: #a1a1aa;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      margin: 40px auto;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Load more ── */
    .load-more-wrap {
      display: flex;
      justify-content: center;
      padding-top: 4px;
    }

    .btn-load-more {
      font-family: var(--sans);
      font-size: 0.8125rem;
      font-weight: 500;
      padding: 10px 24px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted-fg);
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s;
    }

    .btn-load-more:hover:not(:disabled) { border-color: #52525b; color: var(--fg); }
    .btn-load-more:disabled { opacity: 0.4; cursor: default; }
  `;

  // ── Render ────────────────────────────────────────────────────────────

  render() {
    return html`
      <main>
        <div class="page-header">
          <a class="back-btn" href="${resolveRouterPath()}">←</a>
          <span class="page-title">All Sample Runs</span>
          ${!this._loading ? html`<span class="run-count">${this._runs.length}${this._hasMore ? '+' : ''}</span>` : ''}
        </div>

        <div class="content">

          <!-- Search -->
          <div class="search-row">
            <input class="search-input" type="text" placeholder="Filter by tag ID…"
              .value=${this._search}
              @input=${(e: Event) => { this._search = (e.target as HTMLInputElement).value; }}
              @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._search_cloud(); }} />
            <button class="btn-search" @click=${this._search_cloud}>Search</button>
            ${this._search ? html`
              <button class="btn-clear" @click=${() => { this._search = ''; this._load(); }}>✕</button>
            ` : ''}
          </div>

          <!-- Run list -->
          <div class="runs-card">
            ${this._loading ? html`<span class="spinner"></span>`
            : this._error  ? html`<div class="error-msg">${this._error}</div>`
            : this._runs.length === 0 ? html`<div class="state-msg">No runs found.</div>`
            : this._runs.map(r => html`
              <div class="run-row">
                <div class="run-main">
                  <span class="run-tag">${r.tagId || `Doc ${r.id.slice(0, 8)}`}</span>
                  <div class="run-meta">
                    <span class="run-date">${this._fmt(r.startTime)}</span>
                    ${this._hasLocation(r)
                      ? html`<span class="run-loc">${parseFloat(r.lat).toFixed(4)}, ${parseFloat(r.lon).toFixed(4)}</span>`
                      : ''}
                  </div>
                </div>
                <div class="run-actions">
                  <a class="btn-sm" href="#cloud-run/${r.id}">View</a>
                  <button class="btn-delete"
                    ?disabled=${this._deleting.has(r.id)}
                    @click=${() => this._delete(r.id)}>
                    ${this._deleting.has(r.id) ? '…' : 'Delete'}
                  </button>
                </div>
              </div>
            `)}
          </div>

          <!-- Load more -->
          ${this._hasMore ? html`
            <div class="load-more-wrap">
              <button class="btn-load-more" ?disabled=${this._loadingMore} @click=${this._loadMore}>
                ${this._loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          ` : ''}

        </div>
      </main>
    `;
  }
}
