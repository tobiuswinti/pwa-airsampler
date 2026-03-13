const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["code/app-about-JyWZEWgq.js","code/property-QzOEr6Ld.js","code/class-map-wFiN0yRb.js","code/app-rfid-D84Vghz0.js","code/app-ble-CPHnz8MD.js"])))=>i.map(i=>d[i]);
import{n as R,x as f,i as P,r as L,t as E}from"./property-QzOEr6Ld.js";function I(n){return R({...n,state:!0,attribute:!1})}const k="modulepreload",$=function(n){return"/pwa-airsampler/"+n},b={},v=function(e,a,i){let r=Promise.resolve();if(a&&a.length>0){let w=function(c){return Promise.all(c.map(h=>Promise.resolve(h).then(u=>({status:"fulfilled",value:u}),u=>({status:"rejected",reason:u}))))};document.getElementsByTagName("link");const t=document.querySelector("meta[property=csp-nonce]"),s=t?.nonce||t?.getAttribute("nonce");r=w(a.map(c=>{if(c=$(c),c in b)return;b[c]=!0;const h=c.endsWith(".css"),u=h?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${c}"]${u}`))return;const l=document.createElement("link");if(l.rel=h?"stylesheet":k,h||(l.as="script"),l.crossOrigin="",l.href=c,s&&l.setAttribute("nonce",s),document.head.appendChild(l),h)return new Promise((y,_)=>{l.addEventListener("load",y),l.addEventListener("error",()=>_(new Error(`Unable to preload CSS for ${c}`)))})}))}function o(t){const s=new Event("vite:preloadError",{cancelable:!0});if(s.payload=t,window.dispatchEvent(s),!s.defaultPrevented)throw t}return r.then(t=>{for(const s of t||[])s.status==="rejected"&&o(s.reason);return e().catch(o)})},x=Symbol.for("app-tools::log::1.x");globalThis[x]={setDebug:z,debug:"window"in globalThis?new URL(window.location.href).searchParams.has("app-tools-debug"):!1};function z(n){globalThis[x].debug=!!n}function A(n,e){globalThis[x].debug&&(console.groupCollapsed(`[app-tools] ${n}`),e&&console.log(e),console.groupEnd())}function U(n){return(e,a)=>{A(`${n}: ${e}`,a)}}const p=U("router");class S extends Event{constructor(e){super("route-changed"),this.context=e}}class C extends EventTarget{context={params:{},query:{},title:"",url:new URL(window.location.href)};constructor(e){super(),this.config=e,this.routes=e.routes.map(a=>({...a,urlPattern:new URLPattern({pathname:a.path,baseURL:window.location.href,search:"*",hash:"*"})})),p("Initialized routes",this.routes),queueMicrotask(()=>{this.navigate(new URL(window.location.href),{replace:!0})}),window.addEventListener("popstate",this._onPopState),window.addEventListener("click",this._onAnchorClick)}uninstall(){window.removeEventListener("popstate",this._onPopState),window.removeEventListener("click",this._onAnchorClick)}get url(){return new URL(window.location.href)}get fallback(){return new URL(this.config?.fallback||this.baseUrl.href.substring(window.location.origin.length),this.baseUrl)}get baseUrl(){return new URL("./",document.baseURI)}render(){return p(`Rendering route ${this.context.url.pathname}${this.context.url.search}${this.context.url.hash}`,{context:this.context,route:this.route}),this.route?.render?.(this.context)}_matchRoute(e){for(const a of this.routes){const i=a.urlPattern.exec(e);if(i){const{title:r}=a,o=Object.fromEntries(new URLSearchParams(e.search)),t=i?.pathname?.groups??{};return this.context={url:e,title:typeof r=="function"?r({params:t,query:o,url:e}):r,params:t,query:o},a}}return p(`No route matched for ${e.pathname}${e.search}${e.hash}`,e),null}_notifyUrlChanged(){this.dispatchEvent(new S(this.context))}_onPopState=()=>{this.navigate(new URL(window.location.href),{backNav:!0})};_onAnchorClick=e=>{if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey)return;const a=e.composedPath().find(o=>o.tagName==="A");if(!a||!a.href)return;const i=new URL(a.href);if(this.url.href===i.href||i.host!==window.location.host||a.hasAttribute("download")||a.href.includes("mailto:"))return;const r=a.getAttribute("target");r&&r!==""&&r!=="_self"||(e.preventDefault(),this.navigate(i))};_collectPlugins(e){return[...this.config?.plugins??[],...e?.plugins??[]]}async navigate(e,a={}){typeof e=="string"&&(e=new URL(e,this.baseUrl));let i=this._matchRoute(e)||this._matchRoute(this.fallback);p(`Navigating to ${e.pathname}${e.search}${e.hash}`,{context:this.context,route:this.route});let r=this._collectPlugins(i);for(const o of r)try{const t=await o?.shouldNavigate?.(this.context);t&&(await t.condition()||(e=new URL(t.redirect,this.baseUrl),i=this._matchRoute(e)||this._matchRoute(this.fallback),r=this._collectPlugins(i),p("Redirecting",{context:this.context,route:this.route})))}catch(t){throw p(`Plugin "${o.name}" error on shouldNavigate hook`,t),t}if(this.route=i,!this.route)throw new Error(`[ROUTER] No route or fallback matched for url ${e}`);for(const o of r)try{await o?.beforeNavigation?.(this.context)}catch(t){throw p(`Plugin "${o.name}" error on beforeNavigation hook`,t),t}a?.replace?window.history.replaceState(null,"",`${e.pathname}${e.search}${e.hash}`):a.backNav||window.history.pushState(null,"",`${e.pathname}${e.search}${e.hash}`),document.title=this.context.title,this._notifyUrlChanged();for(const o of r)try{await o?.afterNavigation?.(this.context)}catch(t){throw p(`Plugin "${o.name}" error on afterNavigation hook`,t),t}}}function g(n){return{name:"lazy",beforeNavigation:()=>{n()}}}globalThis.URLPattern||await v(()=>import("./index-DkuV2QLQ.js"),[]);const N="/pwa-airsampler/",B=new C({routes:[{path:d(),title:"Home",render:()=>f`<app-home></app-home>`},{path:d("about"),title:"About",plugins:[g(()=>v(()=>import("./app-about-JyWZEWgq.js"),__vite__mapDeps([0,1,2])))],render:()=>f`<app-about></app-about>`},{path:d("rfid"),title:"RFID Scanner",plugins:[g(()=>v(()=>import("./app-rfid-D84Vghz0.js"),__vite__mapDeps([3,1])))],render:()=>f`<app-rfid></app-rfid>`},{path:d("ble"),title:"BLE Control",plugins:[g(()=>v(()=>import("./app-ble-CPHnz8MD.js"),__vite__mapDeps([4,1])))],render:()=>f`<app-ble></app-ble>`}]});function d(n){var e=N;return n&&(e=e+n),e}var T=Object.getOwnPropertyDescriptor,D=(n,e,a,i)=>{for(var r=i>1?void 0:i?T(e,a):e,o=n.length-1,t;o>=0;o--)(t=n[o])&&(r=t(r)||r);return r};let m=class extends L{render(){return f`
      <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Oxanium:wght@300;500;700&display=swap" rel="stylesheet" />

      <main>
        <div class="page-header">
          <div class="logo-icon">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4a6 6 0 110 12A6 6 0 0112 6zm0 2a4 4 0 100 8 4 4 0 010-8z"/></svg>
          </div>
          <span class="page-title">AirSampler</span>
        </div>

        <div class="content">
          <span class="subtitle">Control Panel — Select Module</span>

          <div class="nav-grid">
            <!-- BLE -->
            <a class="nav-card" href="${d("ble")}">
              <div class="nav-icon ble">
                <svg viewBox="0 0 24 24"><path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/></svg>
              </div>
              <div class="nav-text">
                <span class="nav-label">BLE Control</span>
                <span class="nav-desc">Connect & control AirSampler via Bluetooth</span>
              </div>
              <span class="nav-arrow">›</span>
            </a>

            <!-- RFID -->
            <a class="nav-card" href="${d("rfid")}">
              <div class="nav-icon rfid">
                <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4a6 6 0 110 12A6 6 0 0112 6zm0 2a4 4 0 100 8 4 4 0 010-8z"/></svg>
              </div>
              <div class="nav-text">
                <span class="nav-label">RFID / NFC</span>
                <span class="nav-desc">Scan & read NFC tags via Web NFC API</span>
              </div>
              <span class="nav-arrow">›</span>
            </a>

            <!-- About -->
            <a class="nav-card" href="${d("about")}">
              <div class="nav-icon about">
                <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-6h2v6zm0-8h-2V7h2v4z"/></svg>
              </div>
              <div class="nav-text">
                <span class="nav-label">About</span>
                <span class="nav-desc">Project info & documentation</span>
              </div>
              <span class="nav-arrow">›</span>
            </a>
          </div>

          <div class="info-tile">
            <h3>DNAir AirSampler PWA</h3>
            <p>Progressive Web App for controlling the AirSampler device. Requires Chrome on Android for BLE and NFC features.</p>
          </div>
        </div>
      </main>
    `}};m.styles=P`
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
      border: 2px solid var(--accent);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 12px rgba(0,229,255,0.4);
      flex-shrink: 0;
    }

    .logo-icon svg { width: 18px; height: 18px; fill: var(--accent); }

    .page-title {
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--accent);
    }

    .content {
      width: 100%;
      max-width: 640px;
      padding: 28px 20px;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .subtitle {
      font-family: var(--mono);
      font-size: 0.78rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted);
    }

    /* Navigation cards */
    .nav-grid {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .nav-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 22px 24px;
      display: flex;
      align-items: center;
      gap: 18px;
      text-decoration: none;
      color: var(--text);
      transition: border-color 0.25s, transform 0.15s, box-shadow 0.25s;
      position: relative;
      overflow: hidden;
      cursor: pointer;
    }

    .nav-card::after {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--accent), transparent);
      opacity: 0;
      transition: opacity 0.25s;
    }

    .nav-card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
      box-shadow: 0 4px 20px rgba(0,229,255,0.12);
    }

    .nav-card:hover::after { opacity: 1; }

    .nav-icon {
      width: 48px; height: 48px;
      border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }

    .nav-icon svg { width: 26px; height: 26px; }

    .nav-icon.ble {
      background: rgba(124,58,237,0.12);
      border: 1px solid rgba(124,58,237,0.3);
    }
    .nav-icon.ble svg { fill: var(--accent2); }

    .nav-icon.rfid {
      background: rgba(0,229,255,0.08);
      border: 1px solid rgba(0,229,255,0.25);
    }
    .nav-icon.rfid svg { fill: var(--accent); }

    .nav-icon.about {
      background: rgba(0,255,163,0.08);
      border: 1px solid rgba(0,255,163,0.25);
    }
    .nav-icon.about svg { fill: var(--ok); }

    .nav-text { display: flex; flex-direction: column; gap: 4px; }

    .nav-label {
      font-size: 0.95rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .nav-desc {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--muted);
      letter-spacing: 0.04em;
    }

    .nav-arrow {
      margin-left: auto;
      font-size: 1.2rem;
      color: var(--muted);
      transition: color 0.2s, transform 0.2s;
    }

    .nav-card:hover .nav-arrow {
      color: var(--accent);
      transform: translateX(3px);
    }

    /* Info footer */
    .info-tile {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 16px;
    }

    .info-tile h3 {
      font-size: 0.65rem;
      font-family: var(--mono);
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 6px;
    }

    .info-tile p { font-size: 0.8rem; color: var(--text); line-height: 1.5; }

    @media (max-width: 480px) {
      .nav-card { padding: 18px 16px; gap: 14px; }
      .nav-icon { width: 42px; height: 42px; }
      .nav-icon svg { width: 22px; height: 22px; }
    }
  `;m=D([E("app-home")],m);export{I as a,B as b,d as r};
//# sourceMappingURL=app-home-CaTpDGSD.js.map
