import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

import '../../components/header';

@customElement('app-about')
export class AppAbout extends LitElement {
  static styles = css`
    main {
      padding: 20px;
      background: #08090d;
      min-height: 100vh;
      color: #c8d6ef;
    }

    h2 {
      color: #00e5ff;
    }

    .card {
      background: #0e1118;
      border: 1px solid #1e2535;
      border-radius: 14px;
      padding: 20px;
      margin-top: 16px;
    }
  `;

  render() {
    return html`
      <app-header ?enableBack="${true}" title="About"></app-header>

      <main>
        <h2>About AirSampler</h2>

        <div class="card">
          <h2>DNAir AirSampler</h2>
          <p>PWA Control Panel for the AirSampler device.</p>
        </div>
      </main>
    `;
  }
}
