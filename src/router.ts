import { html, TemplateResult } from 'lit';

import './pages/app-home.js';

// ── Route definition ─────────────────────────────────────────────────────────
interface Route {
  hash: string;
  title: string;
  render: () => TemplateResult;
  load?: () => Promise<unknown>;
}

const routes: Route[] = [
  {
    hash: '',
    title: 'AirSampler — Home',
    render: () => html`<app-home></app-home>`,
  },
  {
    hash: '#about',
    title: 'AirSampler — About',
    render: () => html`<app-about></app-about>`,
    load: () => import('./pages/app-about/app-about.js'),
  },
  {
    hash: '#rfid',
    title: 'AirSampler — RFID Scanner',
    render: () => html`<app-rfid></app-rfid>`,
    load: () => import('./pages/app-rfid.js'),
  },
  {
    hash: '#ble',
    title: 'AirSampler — BLE Control',
    render: () => html`<app-ble></app-ble>`,
    load: () => import('./pages/app-ble.js'),
  },
  {
    hash: '#log',
    title: 'AirSampler — Log Viewer',
    render: () => html`<app-log></app-log>`,
    load: () => import('./pages/app-log.js'),
  },
  {
    hash: '#device',
    title: 'AirSampler — Device',
    render: () => html`<app-device></app-device>`,
    load: () => import('./pages/app-device.js'),
  },
  {
    hash: '#history',
    title: 'AirSampler — History',
    render: () => html`<app-history></app-history>`,
    load: () => import('./pages/app-history.js'),
  },
  {
    hash: '#control',
    title: 'AirSampler — Start Sampling',
    render: () => html`<app-control></app-control>`,
    load: () => import('./pages/app-control.js'),
  },
  {
    hash: '#connect',
    title: 'AirSampler — Connect',
    render: () => html`<app-connect></app-connect>`,
    load: () => import('./pages/app-connect.js'),
  },
  {
    hash: '#sync',
    title: 'AirSampler — Sync Logs',
    render: () => html`<app-sync></app-sync>`,
    load: () => import('./pages/app-sync.js'),
  },
  {
    hash: '#status',
    title: 'AirSampler — Status',
    render: () => html`<app-status></app-status>`,
    load: () => import('./pages/app-status.js'),
  },
];

// ── Hash Router ───────────────────────────────────────────────────────────────
class HashRouter extends EventTarget {
  private _current: Route = routes[0];

  constructor() {
    super();
    window.addEventListener('hashchange', () => this._navigate());
    Promise.resolve().then(() => this._navigate());
  }

  private async _navigate() {
    const hash = window.location.hash;
    const route = routes.find((r) => r.hash === hash) ?? routes[0];
    if (route.load) await route.load();
    this._current = route;
    document.title = route.title;
    this.dispatchEvent(new CustomEvent('route-changed'));
  }

  render(): TemplateResult {
    return this._current.render();
  }
}

export const router = new HashRouter();

// ── resolveRouterPath ─────────────────────────────────────────────────────────
// resolveRouterPath()        → '#'      (home)
// resolveRouterPath('ble')   → '#ble'
export function resolveRouterPath(page?: string): string {
  return page ? `#${page}` : '#';
}
