import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';

import './components/app-top-bar';
import './styles/global.css';
import './pages/app-login';
import { router } from './router';
import './run-upload-service'; // activates auto-upload on online events
import { authService } from './auth-service';

@customElement('app-index')
export class AppIndex extends LitElement {

  @state() private _authReady   = !authService.loading;
  @state() private _authed      = !!authService.user;

  private _onAuthChanged = () => {
    this._authReady = !authService.loading;
    this._authed    = !!authService.user;
  };

  static styles = css`
    :host { display: block; }

    .loading-wrap {
      font-family: 'Geist', 'Inter', system-ui, sans-serif;
      background: #09090b;
      color: #fafafa;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .spinner {
      width: 24px; height: 24px;
      border: 2px solid #3f3f46;
      border-top-color: #a1a1aa;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }
  `;

  connectedCallback() {
    super.connectedCallback();
    authService.addEventListener('auth-changed', this._onAuthChanged);
    router.addEventListener('route-changed', () => {
      if ('startViewTransition' in document) {
        (document as any).startViewTransition(() => this.requestUpdate());
      } else {
        this.requestUpdate();
      }
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    authService.removeEventListener('auth-changed', this._onAuthChanged);
  }

  render() {
    if (!this._authReady) {
      return html`<div class="loading-wrap"><div class="spinner"></div></div>`;
    }
    if (!this._authed) {
      return html`<app-login></app-login>`;
    }
    return html`
      <app-top-bar></app-top-bar>
      ${router.render()}
    `;
  }
}
