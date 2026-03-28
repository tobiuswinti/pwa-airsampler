import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { authService } from '../auth-service';

@customElement('app-login')
export class AppLogin extends LitElement {

  @state() private _busy  = false;
  @state() private _error = '';

  private async _signIn() {
    if (this._busy) return;
    this._busy  = true;
    this._error = '';
    try {
      await authService.signIn();
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
        this._error = e.message ?? 'Sign-in failed.';
      }
    } finally {
      this._busy = false;
    }
  }

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

    .wrap {
      font-family: var(--sans);
      background: var(--bg);
      color: var(--fg);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .card {
      width: 100%;
      max-width: 360px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .brand {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .brand-name {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .brand-sub {
      font-size: 0.8125rem;
      color: var(--muted-fg);
      line-height: 1.5;
    }

    .divider {
      height: 1px;
      background: var(--border);
    }

    .btn-google {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      padding: 11px 16px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--fg);
      font-family: var(--sans);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }

    .btn-google:hover:not(:disabled) {
      background: #18181b;
      border-color: #72727a;
    }

    .btn-google:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .google-icon { flex-shrink: 0; }

    .error {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: #f87171;
      text-align: center;
      line-height: 1.5;
    }

    .footnote {
      font-size: 0.72rem;
      color: #3f3f46;
      text-align: center;
      line-height: 1.6;
    }
  `;

  render() {
    return html`
      <div class="wrap">
        <div class="card">
          <div class="brand">
            <span class="brand-name">AirSampler</span>
            <span class="brand-sub">Sign in to access your sampling data and device controls.</span>
          </div>

          <div class="divider"></div>

          <button class="btn-google" ?disabled=${this._busy} @click=${this._signIn}>
            <svg class="google-icon" width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            ${this._busy ? 'Signing in…' : 'Continue with Google'}
          </button>

          ${this._error ? html`<p class="error">${this._error}</p>` : ''}

          <p class="footnote">Access is granted per account. Contact your administrator if you cannot sign in.</p>
        </div>
      </div>
    `;
  }
}
