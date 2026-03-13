import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';

// ── BLE Configuration ─────────────────────────────────────────────────────
const DEVICE_NAME      = 'AirSampler';
const SERVICE_UUID     = '32ff44d8-dbac-4fe6-bb74-ed682397c699';
const SERIAL_CHAR_UUID = '5ae0db2e-f1d4-4736-b435-2c3fe60bd846';
const VALUE_CHAR_UUID  = '863848ed-4743-45b5-b600-e69281cfe806';
const STRING_CHAR_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// ── Types ─────────────────────────────────────────────────────────────────
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'failed';

interface LogEntry {
  time: string;
  direction: 'sent' | 'received';
  text: string;
}

// ── Component ─────────────────────────────────────────────────────────────
@customElement('app-ble')
export class AppBle extends LitElement {

  /* ── State ── */
  @state() private connectionStatus: ConnectionStatus = 'disconnected';
  @state() private sensorValue = '—';
  @state() private sensorTimestamp = '';
  @state() private lastSent = '—';
  @state() private lastReceivedTime = '—';
  @state() private messages: LogEntry[] = [];
  @state() private bleAvailable = true;
  @state() private clock = '';

  private bleDevice:  BluetoothDevice | null = null;
  private bleServer:  BluetoothRemoteGATTServer | null = null;
  private bleService: BluetoothRemoteGATTService | null = null;
  private serialChar: BluetoothRemoteGATTCharacteristic | null = null;
  private stringChar: BluetoothRemoteGATTCharacteristic | null = null;
  private isManualDisconnect = false;
  private clockInterval: number | null = null;

  /* ── Lifecycle ── */
  connectedCallback() {
    super.connectedCallback();
    if (!navigator.bluetooth) {
      this.bleAvailable = false;
    }
    this.clockInterval = window.setInterval(() => {
      this.clock = new Date().toLocaleString();
    }, 1000);
    this.clock = new Date().toLocaleString();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.clockInterval) clearInterval(this.clockInterval);
    this._disconnect();
  }

  /* ── BLE Connect ── */
  private async _connect() {
    if (!navigator.bluetooth) return;

    try {
      this.isManualDisconnect = false;
      this.connectionStatus = 'connecting';

      if (!this.bleDevice) {
        this.bleDevice = await navigator.bluetooth.requestDevice({
          filters: [{ name: DEVICE_NAME }],
          optionalServices: [SERVICE_UUID],
        });
        this.bleDevice.addEventListener('gattserverdisconnected', () => this._onDisconnected());
      }

      this.bleServer  = await this.bleDevice.gatt!.connect();
      this.bleService = await this.bleServer.getPrimaryService(SERVICE_UUID);

      // Sensor notifications
      this.serialChar = await this.bleService.getCharacteristic(SERIAL_CHAR_UUID);
      this.serialChar.addEventListener('characteristicvaluechanged', (e: Event) => {
        const target = e.target as BluetoothRemoteGATTCharacteristic;
        this.sensorValue = new TextDecoder().decode(target.value!);
        this.sensorTimestamp = new Date().toLocaleTimeString();
      });
      await this.serialChar.startNotifications();

      this.connectionStatus = 'connected';

      // String characteristic (optional)
      try {
        this.stringChar = await this.bleService.getCharacteristic(STRING_CHAR_UUID);
        this.stringChar.addEventListener('characteristicvaluechanged', (e: Event) => {
          const target = e.target as BluetoothRemoteGATTCharacteristic;
          const val = new TextDecoder().decode(target.value!);
          this._logMessage('received', val);
          this.lastReceivedTime = new Date().toLocaleString();
        });
        await this.stringChar.startNotifications();

        // Time sync after 3s
        setTimeout(async () => {
          try {
            const timeChar = await this.bleService!.getCharacteristic(STRING_CHAR_UUID);
            await timeChar.writeValue(new TextEncoder().encode('TIME:' + Math.floor(Date.now() / 1000)));
          } catch { /* time sync is best-effort */ }
        }, 3000);
      } catch {
        // string characteristic not available
      }

    } catch (err: any) {
      console.error('Connection failed:', err);
      this.connectionStatus = 'failed';
    }
  }

  private _disconnect() {
    this.isManualDisconnect = true;
    if (this.bleDevice?.gatt?.connected) {
      this.bleDevice.gatt.disconnect();
    }
    this.connectionStatus = 'disconnected';
  }

  private _onDisconnected() {
    if (!this.isManualDisconnect) {
      this.connectionStatus = 'disconnected';
    }
  }

  /* ── Send ── */
  private async _sendValue(value: number) {
    if (!this.bleService) return;
    try {
      const char = await this.bleService.getCharacteristic(VALUE_CHAR_UUID);
      await char.writeValue(new Uint8Array([value]));
      this.lastSent = String(value);
    } catch (e) {
      console.error(e);
    }
  }

  private async _sendString(text: string) {
    if (!this.bleService || !text) return;
    try {
      const char = await this.bleService.getCharacteristic(STRING_CHAR_UUID);
      await char.writeValue(new TextEncoder().encode(text));
      this.lastSent = `"${text}"`;
      this._logMessage('sent', text);
    } catch (e) {
      console.error(e);
    }
  }

  private _sendCustomString() {
    const input = this.shadowRoot?.querySelector<HTMLInputElement>('#stringInput');
    if (!input?.value) return;
    this._sendString(input.value);
    input.value = '';
  }

  /* ── Log ── */
  private _logMessage(direction: 'sent' | 'received', text: string) {
    const entry: LogEntry = {
      time: new Date().toLocaleString(),
      direction,
      text,
    };
    this.messages = [...this.messages, entry];
  }

  private _clearLog() {
    this.messages = [];
  }

  /* ── Styles ── */
  static styles = css`
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
      border: 2px solid var(--accent2);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 12px rgba(124,58,237,0.4);
      flex-shrink: 0;
    }

    .logo-icon svg { width: 18px; height: 18px; fill: var(--accent2); }

    .page-title {
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--accent2);
    }

    .clock-tag {
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
      gap: 16px;
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

    /* ── Cards ── */
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
      background: linear-gradient(90deg, transparent, var(--accent2), transparent);
    }

    .card-title {
      font-family: var(--mono);
      font-size: 0.72rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--accent2);
      margin-bottom: 14px;
    }

    /* ── Connection section ── */
    .conn-row {
      display: flex;
      align-items: center;
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
    }

    .btn:hover { opacity: 0.88; transform: translateY(-1px); }
    .btn:active { transform: translateY(0); }
    .btn:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }

    .btn-connect {
      background: linear-gradient(135deg, var(--accent2), var(--accent));
      color: #fff;
      box-shadow: 0 0 16px rgba(0,229,255,0.15);
    }

    .btn-disconnect {
      background: transparent;
      border: 1px solid var(--warn);
      color: var(--warn);
    }

    .btn-disconnect:hover { background: rgba(255,107,53,0.1); }

    .status-dot {
      width: 10px; height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .status-dot.disconnected { background: #d13a30; }
    .status-dot.connecting   { background: orange; animation: blink 1s infinite; }
    .status-dot.connected    { background: var(--ok); box-shadow: 0 0 8px rgba(0,255,163,0.5); }
    .status-dot.failed       { background: #d13a30; }

    @keyframes blink { 50% { opacity: 0.3; } }

    .status-text {
      font-family: var(--mono);
      font-size: 0.75rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .status-text.disconnected { color: #d13a30; }
    .status-text.connecting   { color: orange; }
    .status-text.connected    { color: var(--ok); }
    .status-text.failed       { color: #d13a30; }

    /* ── Sensor values ── */
    .sensor-row {
      display: flex;
      align-items: baseline;
      gap: 12px;
      margin-top: 12px;
    }

    .sensor-value {
      font-family: var(--mono);
      font-size: 1.6rem;
      color: var(--accent);
      font-weight: 700;
    }

    .sensor-time {
      font-family: var(--mono);
      font-size: 0.68rem;
      color: var(--muted);
    }

    /* ── Controls ── */
    .ctrl-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .ctrl-btn {
      font-family: var(--display);
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 14px 10px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.02);
      color: var(--text);
      cursor: pointer;
      transition: all 0.2s;
    }

    .ctrl-btn:hover {
      border-color: var(--accent2);
      background: rgba(124,58,237,0.08);
      color: #fff;
    }

    .ctrl-btn:active { transform: scale(0.97); }
    .ctrl-btn:disabled { opacity: 0.3; cursor: not-allowed; }

    .ctrl-btn.on  { border-color: var(--ok);   color: var(--ok); }
    .ctrl-btn.on:hover  { background: rgba(0,255,163,0.08); }
    .ctrl-btn.off { border-color: var(--warn);  color: var(--warn); }
    .ctrl-btn.off:hover { background: rgba(255,107,53,0.08); }

    .last-sent {
      font-family: var(--mono);
      font-size: 0.7rem;
      color: var(--muted);
      margin-top: 8px;
    }

    /* ── String input ── */
    .string-row {
      display: flex;
      gap: 8px;
    }

    .string-input {
      flex: 1;
      font-family: var(--mono);
      font-size: 0.82rem;
      padding: 10px 14px;
      border-radius: 7px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.03);
      color: var(--text);
      outline: none;
      transition: border-color 0.2s;
    }

    .string-input::placeholder { color: var(--muted); }
    .string-input:focus { border-color: var(--accent2); }

    .btn-send {
      background: var(--accent2);
      color: #fff;
      box-shadow: none;
    }

    /* ── Message log ── */
    .msg-log {
      max-height: 200px;
      overflow-y: auto;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 14px;
      background: rgba(255,255,255,0.02);
    }

    .msg-entry {
      font-family: var(--mono);
      font-size: 0.72rem;
      line-height: 1.7;
      margin: 0;
    }

    .msg-entry.sent     { color: #5b9bd5; }
    .msg-entry.received { color: var(--text); }

    .msg-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .btn-clear-log {
      font-size: 0.65rem;
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

    .btn-clear-log:hover { color: var(--warn); border-color: var(--warn); }

    .last-received {
      font-family: var(--mono);
      font-size: 0.68rem;
      color: var(--muted);
      margin-top: 6px;
    }

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
      .ctrl-grid { grid-template-columns: 1fr; }
      .card { padding: 16px; }
    }
  `;

  /* ── Render ── */
  render() {
    const isConnected = this.connectionStatus === 'connected';

    return html`
      <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Oxanium:wght@300;500;700&display=swap" rel="stylesheet" />

      <main>
        <div class="page-header">
          <div class="logo-icon">
            <svg viewBox="0 0 24 24"><path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/></svg>
          </div>
          <span class="page-title">BLE Control</span>
          <span class="clock-tag">${this.clock}</span>
        </div>

        <div class="content">

          ${!this.bleAvailable ? html`
            <div class="compat-box">
              Web Bluetooth is not available in this browser. Use Chrome on Android or enable the experimental flag on desktop Chrome.
            </div>
          ` : ''}

          <!-- Connection -->
          <div class="card">
            <div class="card-title">Connection</div>
            <div class="conn-row">
              <button class="btn btn-connect"
                ?disabled=${!this.bleAvailable || this.connectionStatus === 'connecting' || isConnected}
                @click=${this._connect}>
                Connect
              </button>
              <button class="btn btn-disconnect"
                ?disabled=${!isConnected}
                @click=${this._disconnect}>
                Disconnect
              </button>
              <span class="status-dot ${this.connectionStatus}"></span>
              <span class="status-text ${this.connectionStatus}">
                ${this.connectionStatus === 'disconnected' ? 'Disconnected'
                : this.connectionStatus === 'connecting' ? 'Connecting…'
                : this.connectionStatus === 'connected' ? 'Connected'
                : 'Connection Failed'}
              </span>
            </div>

            <div class="sensor-row">
              <span class="sensor-value">${this.sensorValue}</span>
              ${this.sensorTimestamp ? html`<span class="sensor-time">@ ${this.sensorTimestamp}</span>` : ''}
            </div>
          </div>

          <!-- Controls -->
          <div class="card">
            <div class="card-title">Device Controls</div>
            <div class="ctrl-grid">
              <button class="ctrl-btn on"  ?disabled=${!isConnected} @click=${() => this._sendValue(11)}>Servo On</button>
              <button class="ctrl-btn off" ?disabled=${!isConnected} @click=${() => this._sendValue(10)}>Servo Off</button>
              <button class="ctrl-btn on"  ?disabled=${!isConnected} @click=${() => this._sendValue(21)}>Sensor On</button>
              <button class="ctrl-btn off" ?disabled=${!isConnected} @click=${() => this._sendValue(20)}>Sensor Off</button>
              <button class="ctrl-btn"     ?disabled=${!isConnected} @click=${() => this._sendValue(31)}>SD Card On</button>
              <button class="ctrl-btn"     ?disabled=${!isConnected} @click=${() => this._sendValue(41)}>Read RFID</button>
              <button class="ctrl-btn"     ?disabled=${!isConnected} @click=${() => this._sendString('The Reset Button is pressed')}>Reset</button>
              <button class="ctrl-btn"     ?disabled=${!isConnected} @click=${() => this._sendString('The Test Button is pressed')}>Test</button>
            </div>
            <div class="last-sent">Last sent: ${this.lastSent}</div>
          </div>

          <!-- Send String -->
          <div class="card">
            <div class="card-title">Send String</div>
            <div class="string-row">
              <input class="string-input" id="stringInput" type="text" placeholder="Type a string to send…"
                ?disabled=${!isConnected}
                @keyup=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._sendCustomString(); }} />
              <button class="btn btn-send" ?disabled=${!isConnected} @click=${this._sendCustomString}>Send</button>
            </div>
          </div>

          <!-- Messages -->
          <div class="card">
            <div class="msg-header">
              <div class="card-title" style="margin-bottom:0">Messages</div>
              ${this.messages.length > 0
                ? html`<button class="btn-clear-log" @click=${this._clearLog}>Clear</button>`
                : ''}
            </div>
            <div class="msg-log">
              ${this.messages.length === 0
                ? html`<p class="msg-entry" style="color:var(--muted);">No messages yet.</p>`
                : this.messages.map(m => html`
                  <p class="msg-entry ${m.direction}">
                    [${m.time}] ${m.direction === 'sent' ? '→' : '←'} ${m.text}
                  </p>
                `)}
            </div>
            <div class="last-received">Last received: ${this.lastReceivedTime}</div>
          </div>

          <!-- Back to home -->
          <div>
            <a class="nav-back" href="${resolveRouterPath()}">← Back to Home</a>
          </div>

        </div>
      </main>
    `;
  }
}
