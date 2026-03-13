import{r as D,x as l,i as R,t as V}from"./property-QzOEr6Ld.js";import{r as w,a as b}from"./app-home-37ANSCbe.js";import{e as z,f as T,i as _,o as O}from"./log-store-BSOZGDb1.js";var M=Object.defineProperty,B=Object.getOwnPropertyDescriptor,g=(e,t,a,o)=>{for(var i=o>1?void 0:o?B(t,a):t,c=e.length-1,p;c>=0;c--)(p=e[c])&&(i=(o?p(t,a,i):p(i))||i);return o&&i&&M(t,a,i),i};const H={Sensor1:"#00e5ff",Sensor2:"#7c3aed",Servo:"#00ffa3"};function v(e){return H[e]??"#ff6b35"}let h=class extends D{constructor(){super(...arguments),this.data=[],this.rawLines=[],this.about=null,this.activeSource="all",this.activeChart=0}connectedCallback(){super.connectedCallback(),this.data=z(),this.rawLines=T(),this.about=_(),this._unsub=O(()=>{this.data=z(),this.rawLines=T(),this.about=_()})}disconnectedCallback(){super.disconnectedCallback(),this._unsub?.()}updated(){this._drawChart()}get sources(){const e=new Set(this.data.map(t=>t.source));return Array.from(e)}get filteredData(){return this.activeSource==="all"?this.data:this.data.filter(e=>e.source===this.activeSource)}get valueHeaders(){if(this.activeSource==="Sensor1"||this.activeSource==="Sensor2")return["Temp (°C)","Pressure (Pa)","Altitude (m)","Humidity (%)"];if(this.activeSource==="Servo")return["Position","Speed","","Load","Voltage (V)","Temp (°C)"];const e=Math.max(...this.filteredData.map(t=>t.values.length),0);return Array.from({length:e},(t,a)=>`Value ${a+1}`)}_drawChart(){const e=this.shadowRoot?.querySelector("#chart");if(!e)return;const t=e.getContext("2d");if(!t)return;const a=window.devicePixelRatio||1,o=e.getBoundingClientRect();e.width=o.width*a,e.height=o.height*a,t.scale(a,a);const i=o.width,c=o.height,p=55,k=15,u=15,y=30;t.fillStyle="#0e1118",t.fillRect(0,0,i,c),t.strokeStyle="rgba(0,229,255,0.06)",t.lineWidth=1;for(let s=0;s<=5;s++){const d=u+(c-u-y)*s/5;t.beginPath(),t.moveTo(p,d),t.lineTo(i-k,d),t.stroke()}const S=this.activeSource==="all"?this.sources:[this.activeSource],$=this.activeChart;let f=[];for(const s of S){const d=this.data.filter(n=>n.source===s);for(const n of d){const r=parseFloat(n.values[$]);isNaN(r)||f.push(r)}}if(f.length===0){t.fillStyle="#4a5568",t.font="13px sans-serif",t.textAlign="center",t.fillText("No numeric data for this column",i/2,c/2);return}let m=Math.min(...f),x=Math.max(...f);m===x&&(m-=1,x+=1);const C=x-m;t.fillStyle="#4a5568",t.font="10px monospace",t.textAlign="right";for(let s=0;s<=5;s++){const d=x-C*s/5,n=u+(c-u-y)*s/5;t.fillText(d.toFixed(1),p-6,n+3)}for(const s of S){const d=this.data.filter(r=>r.source===s),n=[];for(let r=0;r<d.length;r++){const L=parseFloat(d[r].values[$]);if(isNaN(L))continue;const P=p+(i-p-k)*r/Math.max(d.length-1,1),A=u+(c-u-y)*(1-(L-m)/C);n.push({x:P,y:A})}if(!(n.length<2)){t.strokeStyle=v(s),t.lineWidth=2,t.lineJoin="round",t.beginPath(),t.moveTo(n[0].x,n[0].y);for(let r=1;r<n.length;r++)t.lineTo(n[r].x,n[r].y);t.stroke(),t.fillStyle=v(s);for(const r of n)t.beginPath(),t.arc(r.x,r.y,2.5,0,Math.PI*2),t.fill()}}t.fillStyle="#4a5568",t.font="10px monospace",t.textAlign="center",t.fillText("Sample index →",i/2,c-5)}_downloadCSV(){const e=this.rawLines.join(`
`),t=new Blob([e],{type:"text/csv;charset=utf-8;"}),a=URL.createObjectURL(t),o=document.createElement("a");o.href=a,o.download="airsampler_log.csv",o.click(),URL.revokeObjectURL(a)}render(){if(this.data.length===0)return l`
        <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Oxanium:wght@300;500;700&display=swap" rel="stylesheet" />
        <main>
          <div class="page-header">
            <div class="logo-icon">
              <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z"/></svg>
            </div>
            <span class="page-title">Log Viewer</span>
          </div>
          <div class="content">
            <div class="empty-msg">
              No log data loaded. Go to the BLE page, connect to the device, and press "Request Log".
            </div>
            <div>
              <a class="nav-back" href="${w("ble")}">← Back to BLE Control</a>
            </div>
          </div>
        </main>
      `;const e=this.filteredData,t=this.valueHeaders;return l`
      <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Oxanium:wght@300;500;700&display=swap" rel="stylesheet" />

      <main>
        <div class="page-header">
          <div class="logo-icon">
            <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z"/></svg>
          </div>
          <span class="page-title">Log Viewer</span>
        </div>

        <div class="content">

          <!-- About metadata -->
          ${this.about?l`
            <div class="card">
              <div class="card-title">Log Metadata</div>
              <div class="about-grid">
                ${this.about.rfidTag?l`
                  <div class="about-item">
                    <span class="about-label">RFID Tag</span>
                    <span class="about-value">${this.about.rfidTag}</span>
                  </div>
                `:""}
                ${this.about.deviceName?l`
                  <div class="about-item">
                    <span class="about-label">Device</span>
                    <span class="about-value">${this.about.deviceName}</span>
                  </div>
                `:""}
                ${this.about.gpsLat&&this.about.gpsLng?l`
                  <div class="about-item">
                    <span class="about-label">GPS Location</span>
                    <span class="about-value">
                      <a href="https://www.google.com/maps?q=${this.about.gpsLat},${this.about.gpsLng}" target="_blank" rel="noopener">
                        ${this.about.gpsLat}, ${this.about.gpsLng}
                      </a>
                    </span>
                  </div>
                `:""}
                ${this.about.logStart?l`
                  <div class="about-item">
                    <span class="about-label">Log Start</span>
                    <span class="about-value">${this.about.logStart}</span>
                  </div>
                `:""}
                ${this.about.logEnd?l`
                  <div class="about-item">
                    <span class="about-label">Log End</span>
                    <span class="about-value">${this.about.logEnd}</span>
                  </div>
                `:""}
              </div>
            </div>
          `:""}

          <!-- Filter -->
          <div class="filter-row">
            <button class="filter-btn ${this.activeSource==="all"?"active":""}"
              @click=${()=>{this.activeSource="all",this.activeChart=0}}>All</button>
            ${this.sources.map(a=>l`
              <button class="filter-btn ${this.activeSource===a?"active":""}"
                style="border-color: ${this.activeSource===a?v(a):""}; color: ${this.activeSource===a?v(a):""}"
                @click=${()=>{this.activeSource=a,this.activeChart=0}}>${a}</button>
            `)}
          </div>

          <!-- Chart -->
          <div class="card">
            <div class="card-title">Chart</div>
            <div class="chart-selector">
              ${t.filter(a=>a).map((a,o)=>l`
                <button class="chart-tab ${this.activeChart===o?"active":""}"
                  @click=${()=>{this.activeChart=o}}>${a}</button>
              `)}
            </div>
            <canvas id="chart"></canvas>
            <div class="legend">
              ${(this.activeSource==="all"?this.sources:[this.activeSource]).map(a=>l`
                <div class="legend-item">
                  <span class="legend-dot" style="background:${v(a)}"></span>
                  ${a}
                </div>
              `)}
            </div>
          </div>

          <!-- Table -->
          <div class="card">
            <div class="card-title">Data Table</div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Source</th>
                    ${t.filter(a=>a).map(a=>l`<th>${a}</th>`)}
                  </tr>
                </thead>
                <tbody>
                  ${e.map(a=>l`
                    <tr>
                      <td>${a.timestamp||"—"}</td>
                      <td><span class="source-badge" style="background:${v(a.source)}22;color:${v(a.source)};border:1px solid ${v(a.source)}44">${a.source}</span></td>
                      ${t.filter(o=>o).map((o,i)=>l`<td>${a.values[i]??"—"}</td>`)}
                    </tr>
                  `)}
                </tbody>
              </table>
            </div>
            <div class="row-count">${e.length} rows</div>
          </div>

          <!-- Actions -->
          <div class="actions">
            <button class="btn btn-download" @click=${this._downloadCSV}>Download CSV</button>
          </div>

          <div style="display:flex;gap:10px;">
            <a class="nav-back" href="${w("ble")}">← BLE Control</a>
            <a class="nav-back" href="${w()}">← Home</a>
          </div>

        </div>
      </main>
    `}};h.styles=R`
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
      border: 2px solid var(--ok);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 12px rgba(0,255,163,0.4);
      flex-shrink: 0;
    }

    .logo-icon svg { width: 18px; height: 18px; fill: var(--ok); }

    .page-title {
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--ok);
    }

    .content {
      width: 100%;
      max-width: 900px;
      padding: 28px 20px;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* Cards */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px;
      position: relative;
      overflow: hidden;
    }

    .card::after {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--ok), transparent);
    }

    .card-title {
      font-family: var(--mono);
      font-size: 0.72rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ok);
      margin-bottom: 14px;
    }

    /* Filter tabs */
    .filter-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }

    .filter-btn {
      font-family: var(--mono);
      font-size: 0.68rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 6px 14px;
      border-radius: 5px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      transition: all 0.2s;
    }

    .filter-btn:hover { border-color: var(--accent); color: var(--accent); }
    .filter-btn.active { border-color: var(--ok); color: var(--ok); background: rgba(0,255,163,0.08); }

    /* Chart selector */
    .chart-selector {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }

    .chart-tab {
      font-family: var(--mono);
      font-size: 0.62rem;
      letter-spacing: 0.06em;
      padding: 4px 10px;
      border-radius: 4px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      transition: all 0.2s;
    }

    .chart-tab:hover { border-color: var(--accent2); color: var(--accent2); }
    .chart-tab.active { border-color: var(--accent2); color: var(--accent2); background: rgba(124,58,237,0.1); }

    /* Canvas chart */
    canvas {
      width: 100%;
      height: 260px;
      border: 1px solid var(--border);
      border-radius: 8px;
    }

    /* Legend */
    .legend {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      margin-top: 8px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: var(--mono);
      font-size: 0.68rem;
      color: var(--muted);
    }

    .legend-dot {
      width: 10px; height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    /* Table */
    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: 8px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-family: var(--mono);
      font-size: 0.72rem;
    }

    th {
      padding: 10px 12px;
      text-align: left;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent);
      background: rgba(0,229,255,0.05);
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }

    td {
      padding: 8px 12px;
      border-bottom: 1px solid rgba(30,37,53,0.5);
      color: var(--text);
      white-space: nowrap;
    }

    tr:hover td { background: rgba(0,229,255,0.03); }

    .source-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.62rem;
      font-weight: 600;
      letter-spacing: 0.06em;
    }

    /* Action buttons */
    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .btn {
      font-family: var(--display);
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 10px 22px;
      border-radius: 7px;
      border: none;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.15s;
      text-decoration: none;
    }

    .btn:hover { opacity: 0.88; transform: translateY(-1px); }

    .btn-download {
      background: var(--ok);
      color: var(--bg);
    }

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

    .empty-msg {
      font-family: var(--mono);
      font-size: 0.82rem;
      color: var(--muted);
      text-align: center;
      padding: 40px 20px;
    }

    .row-count {
      font-family: var(--mono);
      font-size: 0.65rem;
      color: var(--muted);
      margin-top: 6px;
    }

    /* About metadata */
    .about-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .about-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .about-label {
      font-family: var(--mono);
      font-size: 0.6rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .about-value {
      font-family: var(--mono);
      font-size: 0.82rem;
      color: var(--accent);
      word-break: break-all;
    }

    .about-value a {
      color: var(--accent2);
      text-decoration: underline;
    }

    @media (max-width: 480px) {
      .card { padding: 16px; }
      canvas { height: 200px; }
      .about-grid { grid-template-columns: 1fr; }
    }
  `;g([b()],h.prototype,"data",2);g([b()],h.prototype,"rawLines",2);g([b()],h.prototype,"about",2);g([b()],h.prototype,"activeSource",2);g([b()],h.prototype,"activeChart",2);h=g([V("app-log")],h);export{h as AppLog};
//# sourceMappingURL=app-log-BgGd_IAo.js.map
