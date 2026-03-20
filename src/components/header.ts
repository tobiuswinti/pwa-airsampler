import { LitElement, css, html } from 'lit';
import { property, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';

@customElement('app-header')
export class AppHeader extends LitElement {
  @property({ type: String }) title = 'AirSampler';
  @property({ type: Boolean }) enableBack: boolean = false;

  static styles = css`
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--app-color-primary);
      color: white;
      padding: 12px;
      padding-top: 4px;

      position: fixed;
      left: env(titlebar-area-x, 0);
      top: env(titlebar-area-y, 0);
      height: env(titlebar-area-height, 30px);
      width: env(titlebar-area-width, 100%);
      -webkit-app-region: drag;
    }

    header h1 {
      margin-top: 0;
      margin-bottom: 0;
      font-size: 12px;
      font-weight: bold;
    }

    #back-button-block {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .back-btn {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 4px 12px;
      border: 1px solid rgba(255, 255, 255, 0.6);
      border-radius: 6px;
      color: white;
      text-decoration: none;
      cursor: pointer;
      transition: opacity 0.2s;
      -webkit-app-region: no-drag;
    }

    .back-btn:hover {
      opacity: 0.75;
    }
  `;

  render() {
    return html`
      <header>
        <div id="back-button-block">
          ${this.enableBack
            ? html`<a class="back-btn" href="${resolveRouterPath()}">← Back</a>`
            : null}
          <h1>${this.title}</h1>
        </div>
      </header>
    `;
  }
}
