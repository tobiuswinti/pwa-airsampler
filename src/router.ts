import { html, TemplateResult } from 'lit';

import './pages/app-home.js';

// ── Route definition ─────────────────────────────────────────────────────────
interface Route {
  hash: string;
  prefix?: boolean;
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
    title: 'AirSampler — Download Sample Data',
    render: () => html`<app-sync></app-sync>`,
    load: () => import('./pages/app-sync.js'),
  },
  {
    hash: '#admin',
    title: 'AirSampler — Admin',
    render: () => html`<app-admin></app-admin>`,
    load: () => import('./pages/app-admin.js'),
  },
  {
    hash: '#status',
    title: 'AirSampler — Status',
    render: () => html`<app-status></app-status>`,
    load: () => import('./pages/app-status.js'),
  },
  {
    hash: '#run/',
    prefix: true,
    title: 'AirSampler — Run',
    render: () => html`<app-run></app-run>`,
    load: () => import('./pages/app-run.js'),
  },
  {
    hash: '#cloud-run/',
    prefix: true,
    title: 'AirSampler — Cloud Run',
    render: () => html`<app-run></app-run>`,
    load: () => import('./pages/app-run.js'),
  },
  {
    hash: '#lookup',
    title: 'AirSampler — Sample Lookup',
    render: () => html`<app-lookup></app-lookup>`,
    load: () => import('./pages/app-lookup.js'),
  },
  {
    hash: '#admin-runs',
    title: 'AirSampler — All Sample Runs',
    render: () => html`<app-admin-runs></app-admin-runs>`,
    load: () => import('./pages/app-admin-runs.js'),
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
    const route = routes.find((r) => r.prefix ? hash.startsWith(r.hash) : r.hash === hash) ?? routes[0];
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
