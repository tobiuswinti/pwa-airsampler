import{r as p,x as s,i as g,t as h}from"./property-QzOEr6Ld.js";import{r as b,a as l}from"./app-home-37ANSCbe.js";import{s as u}from"./log-store-BSOZGDb1.js";var m=Object.defineProperty,f=Object.getOwnPropertyDescriptor,d=(t,e,a,o)=>{for(var n=o>1?void 0:o?f(e,a):e,c=t.length-1,r;c>=0;c--)(r=t[c])&&(n=(o?r(e,a,n):r(n))||n);return o&&n&&m(e,a,n),n};let i=class extends p{constructor(){super(...arguments),this.scanStatus="idle",this.statusText="Ready to scan",this.iconState="",this.tags=[],this.browserInfo="—",this.nfcAvailable=!0,this.showCompat=!1,this.compatMsg="",this.abortController=null,this.tagIdCounter=0}connectedCallback(){super.connectedCallback(),this._checkBrowser()}disconnectedCallback(){super.disconnectedCallback(),this._stopScan(!1)}_checkBrowser(){const t=navigator.userAgent,e=t.match(/Chrome\/(\d+)/),a=!!e,o=a?parseInt(e[1]):0,n=/Android/.test(t);this.browserInfo=a?`Chrome ${o} · ${n?"Android":"Desktop"}`:"Unsupported Browser","NDEFReader"in window||(this.nfcAvailable=!1,this.showCompat=!0,this.scanStatus="unavailable",this.statusText="NFC not available",this.compatMsg="⚠ Browser not supported. Web NFC requires Chrome 89+ on Android. Desktop browsers and Safari/Firefox do not support the Web NFC API.")}async _startScan(){if(this.nfcAvailable){this.abortController=new AbortController,this.scanStatus="scanning",this.statusText="Scanning — hold tag near device…",this.iconState="";try{const t=new window.NDEFReader;t.addEventListener("reading",({message:e,serialNumber:a})=>{this._onTagRead(e,a)}),t.addEventListener("readingerror",()=>{this.statusText="Could not read tag — try again",this.iconState="error",this.scanStatus="error",setTimeout(()=>{this.scanStatus!=="idle"&&(this.statusText="Scanning — hold tag near device…",this.iconState="",this.scanStatus="scanning")},2e3)}),await t.scan({signal:this.abortController.signal})}catch(t){t.name==="AbortError"?(this.statusText="Scan stopped",this.iconState=""):t.name==="NotAllowedError"?(this.statusText="Permission denied",this.iconState="error",this.showCompat=!0,this.compatMsg="⚠ Permission denied. Allow NFC access when prompted, or check your browser settings."):(this.statusText=`Error: ${t.message}`,this.iconState="error"),this._stopScan(!1)}}}_stopScan(t=!0){this.abortController&&(this.abortController.abort(),this.abortController=null),this.scanStatus="idle",t&&(this.statusText="Ready to scan",this.iconState="")}_onTagRead(t,e){this.statusText="Tag detected!",this.iconState="success",this.scanStatus="detected";const a=t.records.map(n=>this._decodeRecord(n)),o={id:++this.tagIdCounter,serialNumber:e??"",time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"}),records:a};e&&u(e),this.tags=[o,...this.tags],setTimeout(()=>{this.scanStatus!=="idle"&&(this.statusText="Scanning — hold tag near device…",this.iconState="",this.scanStatus="scanning")},1800)}_clearTags(){this.tags=[],this.tagIdCounter=0}_decodeRecord(t){const{recordType:e,mediaType:a,encoding:o,lang:n,data:c}=t,r={type:e,enc:null,lang:null,value:null,isHex:!1};try{e==="text"?(r.value=new TextDecoder(o||"utf-8").decode(c),r.enc=o||"utf-8",r.lang=n||"en"):e==="url"?r.value=new TextDecoder().decode(c):e==="mime"||a?(r.type=a||e,r.value=(a||"").startsWith("text/")?new TextDecoder().decode(c):this._toHex(c),r.isHex=!(a||"").startsWith("text/")):e==="smart-poster"?r.value="(Smart Poster — see nested records)":(r.value=this._toHex(c),r.isHex=!0)}catch{r.value=this._toHex(c),r.isHex=!0}return r}_toHex(t){const e=new Uint8Array(t.buffer??t);return Array.from(e).map(a=>a.toString(16).padStart(2,"0").toUpperCase()).join(" ")}render(){const t=this.scanStatus==="scanning"||this.scanStatus==="detected";return s`
      <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Oxanium:wght@300;500;700&display=swap" rel="stylesheet" />

      <main>
        <!-- Page header -->
        <div class="page-header">
          <div class="logo-icon">
            <svg viewBox="0 0 24 24"><path d="M2 12C2 6.48 6.48 2 12 2s10 4.48 10 10-4.48 10-10 10S2 17.52 2 12zm10-6a6 6 0 100 12A6 6 0 0012 6zm0 2a4 4 0 110 8 4 4 0 010-8z"/></svg>
          </div>
          <span class="page-title">RFID / NFC Reader</span>
          <span class="browser-tag">${this.browserInfo}</span>
        </div>

        <div class="content">

          <!-- Compatibility warning -->
          ${this.showCompat?s`
            <div class="compat-box">${this.compatMsg}</div>
          `:""}

          <!-- Scanner card -->
          <div class="scanner-card">
            <div class="pulse-wrap ${t?"scanning":""}">
              <div class="ring"></div>
              <div class="ring"></div>
              <div class="ring"></div>
              <div class="nfc-icon ${this.iconState}">
                <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                  <path d="M8.5 8.5c1-1 2.3-1.5 3.5-1.5s2.5.5 3.5 1.5"/>
                  <path d="M6 6c1.7-1.7 4-2.7 6-2.7s4.3 1 6 2.7"/>
                  <circle cx="12" cy="14" r="1.5" fill="currentColor" stroke="none"/>
                </svg>
              </div>
            </div>

            <div class="status-label ${this.scanStatus}">
              ${this.statusText}
            </div>

            ${t?s`
              <button class="btn-stop" @click=${()=>this._stopScan()}>
                Stop
              </button>
            `:s`
              <button
                class="btn-scan"
                ?disabled=${!this.nfcAvailable}
                @click=${this._startScan}>
                Start Scanning
              </button>
            `}
          </div>

          <!-- Results -->
          ${this.tags.length>0?s`
            <div class="result-panel">
              <div class="result-header">
                <span class="result-header-label">Scanned Tags</span>
                <div style="display:flex;gap:8px;align-items:center;">
                  <span class="tag-count">${this.tags.length}</span>
                  <button class="btn-clear" @click=${this._clearTags}>Clear</button>
                </div>
              </div>

              ${this.tags.map(e=>s`
                <div class="record-item">
                  ${e.serialNumber?s`
                    <div class="record-meta">
                      <span class="badge badge-type">UID</span>
                      <span class="record-data" style="flex:1;">${e.serialNumber}</span>
                      <span class="badge badge-time">${e.time}</span>
                    </div>
                  `:""}

                  ${e.records.map((a,o)=>s`
                    <div class="record-meta">
                      <span class="badge badge-type">${a.type}</span>
                      ${a.enc?s`<span class="badge badge-enc">${a.enc}</span>`:""}
                      ${a.lang?s`<span class="badge badge-lang">lang:${a.lang}</span>`:""}
                      ${!e.serialNumber&&o===0?s`<span class="badge badge-time">${e.time}</span>`:""}
                    </div>
                    <div class="record-data ${a.isHex?"hex":""}">
                      ${a.value??"(empty)"}
                    </div>
                  `)}
                </div>
              `)}
            </div>
          `:""}

          <!-- Info tiles -->
          <div class="info-grid">
            <div class="info-tile">
              <h3>Supported Tags</h3>
              <p>NFC Forum Type 1–5, ISO 14443 A/B, NDEF, MIFARE Ultralight, NTAG213/215/216</p>
            </div>
            <div class="info-tile">
              <h3>Requirements</h3>
              <p>Chrome 89+ on Android with NFC hardware enabled. No app needed.</p>
            </div>
            <div class="info-tile">
              <h3>Record Types</h3>
              <p>Text, URL, MIME types, Smart Poster, and raw binary (shown as hex)</p>
            </div>
            <div class="info-tile">
              <h3>How to Use</h3>
              <p>Tap "Start Scanning", then hold your NFC tag near the back of your phone.</p>
            </div>
          </div>

          <!-- Back to home -->
          <div>
            <a class="nav-back" href="${b()}">← Back to Home</a>
          </div>

        </div>
      </main>
    `}};i.styles=g`
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

    /* Grid background */
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

    /* ── Page header ── */
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

    .browser-tag {
      margin-left: auto;
      font-family: var(--mono);
      font-size: 0.65rem;
      color: var(--muted);
      letter-spacing: 0.06em;
      white-space: nowrap;
    }

    /* ── Inner content ── */
    .content {
      width: 100%;
      max-width: 640px;
      padding: 28px 20px;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    /* ── Compat warning ── */
    .compat-box {
      background: rgba(255,107,53,0.06);
      border: 1px solid rgba(255,107,53,0.3);
      border-radius: 12px;
      padding: 14px 18px;
      font-size: 0.82rem;
      line-height: 1.65;
      color: #e2a98a;
    }

    /* ── Scanner card ── */
    .scanner-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 36px 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
      position: relative;
      overflow: hidden;
    }

    .scanner-card::after {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--accent), transparent);
    }

    /* Pulse rings */
    .pulse-wrap {
      position: relative;
      width: 140px; height: 140px;
      display: flex; align-items: center; justify-content: center;
    }

    .ring {
      position: absolute;
      border-radius: 50%;
      border: 1.5px solid var(--accent);
      opacity: 0;
    }

    .ring:nth-child(1) { width: 60px;  height: 60px; }
    .ring:nth-child(2) { width: 90px;  height: 90px; }
    .ring:nth-child(3) { width: 122px; height: 122px; }

    .scanning .ring                   { animation: ripple 2.4s ease-out infinite; }
    .scanning .ring:nth-child(2)      { animation-delay: 0.6s; }
    .scanning .ring:nth-child(3)      { animation-delay: 1.2s; }

    @keyframes ripple {
      0%   { transform: scale(0.7); opacity: 0.8; }
      100% { transform: scale(1.1); opacity: 0; }
    }

    .nfc-icon {
      width: 52px; height: 52px;
      background: rgba(0,229,255,0.08);
      border: 1.5px solid var(--accent);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.3s ease;
      z-index: 1;
    }

    .nfc-icon svg { width: 26px; height: 26px; stroke: var(--accent); fill: none; stroke-width: 1.8; }

    .nfc-icon.success { border-color: var(--ok);   background: rgba(0,255,163,0.1); }
    .nfc-icon.success svg { stroke: var(--ok); }
    .nfc-icon.error   { border-color: var(--warn);  background: rgba(255,107,53,0.1); }
    .nfc-icon.error   svg { stroke: var(--warn); }

    .status-label {
      font-family: var(--mono);
      font-size: 0.78rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
      text-align: center;
    }

    .status-label.scanning { color: var(--accent); }
    .status-label.detected { color: var(--ok); }
    .status-label.error    { color: var(--warn); }

    /* ── Buttons ── */
    .btn-scan {
      font-family: var(--display);
      font-size: 0.9rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      padding: 14px 44px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      background: linear-gradient(135deg, var(--accent2), var(--accent));
      color: #fff;
      transition: opacity 0.2s, transform 0.15s;
      box-shadow: 0 0 20px rgba(0,229,255,0.2);
    }

    .btn-scan:hover   { opacity: 0.88; transform: translateY(-1px); }
    .btn-scan:active  { transform: translateY(0); }
    .btn-scan:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }

    .btn-stop {
      font-family: var(--display);
      font-size: 0.8rem;
      font-weight: 500;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 9px 28px;
      border-radius: 6px;
      border: 1px solid var(--warn);
      background: transparent;
      color: var(--warn);
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-stop:hover { background: rgba(255,107,53,0.1); }

    /* ── Result panel ── */
    .result-panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
    }

    .result-header {
      padding: 14px 20px;
      background: rgba(0,229,255,0.05);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .result-header-label {
      font-family: var(--mono);
      font-size: 0.72rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--accent);
    }

    .tag-count {
      background: var(--accent);
      color: var(--bg);
      font-family: var(--mono);
      font-size: 0.65rem;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 20px;
    }

    .btn-clear {
      font-size: 0.68rem;
      font-family: var(--mono);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      background: none;
      border: 1px solid var(--border);
      color: var(--muted);
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      transition: color 0.2s, border-color 0.2s;
    }

    .btn-clear:hover { color: var(--warn); border-color: var(--warn); }

    /* ── Tag record ── */
    .record-item {
      padding: 18px 20px;
      border-bottom: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 10px;
      animation: slideIn 0.3s ease;
    }

    .record-item:last-child { border-bottom: none; }

    @keyframes slideIn {
      from { opacity: 0; transform: translateY(-6px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .record-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .badge {
      font-family: var(--mono);
      font-size: 0.62rem;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid;
    }

    .badge-type { color: var(--accent2); border-color: var(--accent2); background: rgba(124,58,237,0.1); }
    .badge-enc  { color: var(--accent);  border-color: var(--accent);  background: rgba(0,229,255,0.08); }
    .badge-lang { color: var(--ok);      border-color: var(--ok);      background: rgba(0,255,163,0.08); }
    .badge-time { color: var(--muted);   border-color: var(--border);  background: transparent; margin-left: auto; }

    .record-data {
      font-family: var(--mono);
      font-size: 0.82rem;
      color: #e2e8f0;
      background: rgba(255,255,255,0.03);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px 14px;
      word-break: break-all;
      line-height: 1.6;
    }

    .record-data.hex { color: var(--accent); font-size: 0.72rem; letter-spacing: 0.05em; }

    /* ── Info grid ── */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

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

    /* ── Back nav ── */
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

    @media (max-width: 480px) {
      .info-grid { grid-template-columns: 1fr; }
      .scanner-card { padding: 28px 16px; }
    }
  `;d([l()],i.prototype,"scanStatus",2);d([l()],i.prototype,"statusText",2);d([l()],i.prototype,"iconState",2);d([l()],i.prototype,"tags",2);d([l()],i.prototype,"browserInfo",2);d([l()],i.prototype,"nfcAvailable",2);d([l()],i.prototype,"showCompat",2);d([l()],i.prototype,"compatMsg",2);i=d([h("app-rfid")],i);export{i as AppRfid};
//# sourceMappingURL=app-rfid-BrxATc2d.js.map
