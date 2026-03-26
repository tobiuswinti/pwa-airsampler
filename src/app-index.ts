import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';

import './components/ble-status-bar';
import './styles/global.css';
import { router } from './router';
import './run-upload-service'; // activates auto-upload on online events

@customElement('app-index')
export class AppIndex extends LitElement {
  static styles = css`
    :host { display: block; }
  `;

  firstUpdated() {
    router.addEventListener('route-changed', () => {
      if ('startViewTransition' in document) {
        (document as any).startViewTransition(() => this.requestUpdate());
      } else {
        this.requestUpdate();
      }
    });
  }

  render() {
    return html`
      <ble-status-bar></ble-status-bar>
      ${router.render()}
    `;
  }
}
