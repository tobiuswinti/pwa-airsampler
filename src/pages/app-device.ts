import { LitElement, css, html } from 'lit';
import { state, customElement } from 'lit/decorators.js';
import { resolveRouterPath } from '../router';
import {
  setLogData, parseLogLines, hasLogData, clearLogData,
  setAboutData, parseAboutLines, setLastRfidTag,
} from '../log-store';

// ── BLE Configuration ─────────────────────────────────────────────────────
const DEVICE_NAME      = 'AirSampler';
const SERVICE_UUID     = '32ff44d8-dbac-4fe6-bb74-ed682397c699';
const SERIAL_CHAR_UUID = '5ae0db2e-f1d4-4736-b435-2c3fe60bd846';
const STRING_CHAR_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

/** Max sampling hours at 100% battery (adjust to match device spec) */
const FULL_CHARGE_HOURS = 8;

// ── Types ─────────────────────────────────────────────────────────────────
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'failed';
type LedStatus = 'ok' | 'warn' | 'error' | 'unknown';

interface DeviceStatus {
  fan:       LedStatus;
  sensor:    LedStatus;
  servo:     LedStatus;
  cartridge: LedStatus;
  sdcard:    LedStatus;
}

interface LogEntry {
  time:      string;
  direction: 'sent' | 'received';
  text:      string;
}

// ── Component ─────────────────────────────────────────────────────────────
@customElement('app-device')
export class AppDevice extends LitElement {

  /* ── State ── */
  @state() private connectionStatus: ConnectionStatus = 'disconnected';
  @state() private bleAvailable = true;
  @state() private clock = '';

  // Device component status LEDs
  @state() private deviceStatus: DeviceStatus = {
    fan: 'unknown', sensor: 'unknown', servo: 'unknown',
    cartridge: 'unknown', sdcard: 'unknown',
  };

  // Battery
  @state() private battVoltage  = 0;
  @state() private battPercent  = 0;
  @state() private battHours    = 0;

  // Sampling
  @state() private samplingState:   'idle' | 'running' = 'idle';
  @state() private samplingElapsed  = '—';

  // Log transfer
  @state() private logTransferStatus: 'idle' | 'requesting' | 'receiving' | 'done' | 'error' = 'idle';
  @state() private logLinesReceived  = 0;

  // Message log
  @state() private messages:          LogEntry[] = [];
  @state() private lastReceivedTime   = '—';

  // Insert New Sample modal
  @state() private showSampleModal   = false;
  @state() private sampleScanStatus: 'idle' | 'scanning' | 'detected' | 'error' | 'no_nfc' = 'idle';
  @state() private sampleTagId       = '';
  @state() private sampleGpsStatus:  'idle' | 'getting' | 'got' | 'unavailable' = 'idle';
  @state() private sampleGps         = '';
  @state() private sampleSendStatus: 'idle' | 'sending' | 'done' | 'error' = 'idle';

  /* ── Private fields ── */
  private bleDevice:  BluetoothDevice | null = null;
  private bleServer:  BluetoothRemoteGATTServer | null = null;
  private bleService: BluetoothRemoteGATTService | null = null;
  private isManualDisconnect = false;
  private clockInterval:    number | null = null;
  private logBuffer:  string[] = [];
  private isReceivingLog   = false;
  private aboutBuffer: string[] = [];
  private isReceivingAbout = false;
  private nfcAbortController: AbortController | null = null;

  /* ── Lifecycle ── */
  connectedCallback() {
    super.connectedCallback();
    if (!navigator.bluetooth) this.bleAvailable = false;
    this.clockInterval = window.setInterval(() => {
      this.clock = new Date().toLocaleString();
    }, 1000);
    this.clock = new Date().toLocaleString();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.clockInterval) clearInterval(this.clockInterval);
    this._stopNfcScan();
    this._disconnect();
  }

  /* ── BLE: Connect ── */
  private async _connect() {
    if (!navigator.bluetooth) return;
    try {
      this.isManualDisconnect = false;
      this.connectionStatus   = 'connecting';

      if (!this.bleDevice) {
        this.bleDevice = await navigator.bluetooth.requestDevice({
          filters:          [{ name: DEVICE_NAME }],
          optionalServices: [SERVICE_UUID],
        });
        this.bleDevice.addEventListener('gattserverdisconnected', () => this._onDisconnected());
      }

      this.bleServer  = await this.bleDevice.gatt!.connect();
      this.bleService = await this.bleServer.getPrimaryService(SERVICE_UUID);

      // Serial characteristic — receives sensor + status data
      const serialChar = await this.bleService.getCharacteristic(SERIAL_CHAR_UUID);
      serialChar.addEventListener('characteristicvaluechanged', (e: Event) => {
        const val = new TextDecoder().decode((e.target as BluetoothRemoteGATTCharacteristic).value!);
        this._handleSerialNotification(val);
      });
      await serialChar.startNotifications();

      this.connectionStatus = 'connected';

      // String characteristic — log transfer, commands, metadata
      try {
        const strChar = await this.bleService.getCharacteristic(STRING_CHAR_UUID);
        strChar.addEventListener('characteristicvaluechanged', (e: Event) => {
          const val = new TextDecoder().decode((e.target as BluetoothRemoteGATTCharacteristic).value!);
          this._handleStringNotification(val);
        });
        await strChar.startNotifications();

        // Post-connect: sync time only
        setTimeout(async () => {
          try {
            const ch = await this.bleService!.getCharacteristic(STRING_CHAR_UUID);
            await ch.writeValue(new TextEncoder().encode('TIME:' + Math.floor(Date.now() / 1000)));
          } catch { /* best-effort */ }
        }, 3000);
      } catch { /* string char not available */ }

    } catch (err: any) {
      console.error('BLE connect failed:', err);
      this.connectionStatus = 'failed';
    }
  }

  private _disconnect() {
    this.isManualDisconnect = true;
    if (this.bleDevice?.gatt?.connected) this.bleDevice.gatt.disconnect();
    this.connectionStatus = 'disconnected';
  }

  private _onDisconnected() {
    if (!this.isManualDisconnect) this.connectionStatus = 'disconnected';
  }

  /* ── BLE: Incoming data ── */
  private _handleSerialNotification(val: string) {
    // Status / battery / sampling state come in via serial characteristic
    if (val.startsWith('STATUS:') || val.startsWith('BATT:') || val.startsWith('SAMPLING:')) {
      this._parseDeviceMessage(val);
    }
  }

  private _handleStringNotification(val: string) {
    // ── Log file transfer ──
    if (val === 'LOG_START') {
      this.isReceivingLog   = true;
      this.logBuffer        = [];
      this.logLinesReceived = 0;
      this.logTransferStatus = 'receiving';
      return;
    }
    if (val === 'LOG_END') {
      this.isReceivingLog = false;
      setLogData(parseLogLines(this.logBuffer), this.logBuffer);
      this.logTransferStatus = 'done';
      return;
    }
    if (val === 'LOG_ERROR') {
      this.isReceivingLog    = false;
      this.logTransferStatus = 'error';
      return;
    }
    if (this.isReceivingLog) {
      this.logBuffer.push(val);
      this.logLinesReceived = this.logBuffer.length;
      return;
    }

    // ── About metadata transfer ──
    if (val === 'ABOUT_START') {
      this.isReceivingAbout = true;
      this.aboutBuffer      = [];
      return;
    }
    if (val === 'ABOUT_END') {
      this.isReceivingAbout = false;
      setAboutData(parseAboutLines(this.aboutBuffer));
      return;
    }
    if (this.isReceivingAbout) {
      this.aboutBuffer.push(val);
      return;
    }

    // ── Device telemetry forwarded via stringChar ──
    if (val.startsWith('STATUS:') || val.startsWith('BATT:') || val.startsWith('SAMPLING:')) {
      this._parseDeviceMessage(val);
      return;
    }

    this._logMsg('received', val);
    this.lastReceivedTime = new Date().toLocaleString();
  }

  /**
   * Parses incoming telemetry messages from the ESP32.
   *
   * Expected formats:
   *   STATUS:fan=0,sensor=0,servo=1,cartridge=0,sdcard=2
   *     (2 = ok, 1 = warn, 0 = error)
   *   BATT:3.72,78
   *     (voltage in V, percentage 0-100)
   *   SAMPLING:1  /  SAMPLING:0
   *     (1 = started, 0 = stopped)
   */
  private _parseDeviceMessage(val: string) {
    if (val.startsWith('STATUS:')) {
      const updated: Partial<DeviceStatus> = {};
      for (const part of val.substring(7).split(',')) {
        const [key, v] = part.split('=');
        const led: LedStatus = v === '0' ? 'error' : v === '1' ? 'warn' : v === '2' ? 'ok' : 'unknown';
        if (key === 'fan' || key === 'sensor' || key === 'servo' ||
            key === 'cartridge' || key === 'sdcard') {
          updated[key as keyof DeviceStatus] = led;
        }
      }
      this.deviceStatus = { ...this.deviceStatus, ...updated };
      return;
    }

    if (val.startsWith('BATT:')) {
      const [vStr, pStr] = val.substring(5).split(',');
      this.battVoltage = parseFloat(vStr) || 0;
      this.battPercent = Math.min(100, Math.max(0, parseInt(pStr) || 0));
      this.battHours   = parseFloat(((this.battPercent / 100) * FULL_CHARGE_HOURS).toFixed(1));
      return;
    }

    if (val.startsWith('SAMPLING:')) {
      const totalSec = parseInt(val.substring(9).trim(), 10);
      if (!isNaN(totalSec)) {
        this.samplingState = 'running';
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        this.samplingElapsed =
          (h > 0 ? String(h).padStart(2, '0') + ':' : '') +
          String(m).padStart(2, '0') + ':' +
          String(s).padStart(2, '0');
      }
    }
  }

  /* ── BLE: Send ── */
  private async _sendString(text: string): Promise<void> {
    if (!this.bleService) return;
    const char = await this.bleService.getCharacteristic(STRING_CHAR_UUID);
    await char.writeValue(new TextEncoder().encode(text));
    this._logMsg('sent', text);
  }

  /* ── SD Log ── */
  private async _requestLog() {
    if (!this.bleService) return;
    this.logTransferStatus = 'requesting';
    try {
      await this._sendString('SENDLOG');
    } catch {
      this.logTransferStatus = 'error';
    }
  }

  private _clearLocalLog() {
    clearLogData();
    this.logTransferStatus = 'idle';
    this.logLinesReceived  = 0;
  }

  /* ── Sampling controls ── */
  private async _startSampling() {
    try { await this._sendString('START_SAMPLING'); } catch { /* ignore */ }
    this.samplingState   = 'running';
    this.samplingElapsed = '00:00';
  }

  private async _stopSampling() {
    try { await this._sendString('STOP_SAMPLING'); } catch { /* ignore */ }
    this.samplingState = 'idle';
  }

  /* ── Insert New Sample (NFC + GPS → ESP32) ── */
  private _openSampleModal() {
    this.showSampleModal  = true;
    this.sampleScanStatus = 'idle';
    this.sampleTagId      = '';
    this.sampleGps        = '';
    this.sampleGpsStatus  = 'idle';
    this.sampleSendStatus = 'idle';
  }

  private _closeSampleModal() {
    this._stopNfcScan();
    this.showSampleModal = false;
  }

  private async _startNfcScan() {
    if (!('NDEFReader' in window)) {
      this.sampleScanStatus = 'no_nfc';
      return;
    }
    this.nfcAbortController = new AbortController();
    this.sampleScanStatus   = 'scanning';
    try {
      const reader = new (window as any).NDEFReader();
      reader.addEventListener('reading', ({ serialNumber }: any) => {
        if (serialNumber) {
          this.sampleTagId = serialNumber;
          setLastRfidTag(serialNumber);
          this.sampleScanStatus = 'detected';
          this._stopNfcScan();
          this._getGpsForSample();
        }
      });
      reader.addEventListener('readingerror', () => {
        this.sampleScanStatus = 'error';
      });
      await reader.scan({ signal: this.nfcAbortController.signal });
    } catch (err: any) {
      if (err.name !== 'AbortError') this.sampleScanStatus = 'error';
    }
  }

  private _stopNfcScan() {
    if (this.nfcAbortController) {
      this.nfcAbortController.abort();
      this.nfcAbortController = null;
    }
    if (this.sampleScanStatus === 'scanning') this.sampleScanStatus = 'idle';
  }

  private _getGpsForSample() {
    this.sampleGpsStatus = 'getting';
    if (!('geolocation' in navigator)) {
      this.sampleGpsStatus = 'unavailable';
      this.sampleGps       = 'unavailable';
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.sampleGps       = `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
        this.sampleGpsStatus = 'got';
      },
      () => {
        this.sampleGpsStatus = 'unavailable';
        this.sampleGps       = 'unavailable';
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  /**
   * Sends NEWSAMPL command to ESP32.
   * ESP32 writes the RFID tag + GPS coordinates to its about.txt on the SD card.
   * Format: NEWSAMPL:<uid>,<lat>,<lng>
   */
  private async _sendNewSample() {
    if (!this.sampleTagId || !this.bleService) return;
    this.sampleSendStatus = 'sending';
    try {
      const gps = (this.sampleGps && this.sampleGps !== 'unavailable') ? this.sampleGps : '0.000000,0.000000';
      const dev = navigator.userAgent.includes('Android') ? 'Android Phone'
                : navigator.userAgent.includes('iPhone')  ? 'iPhone'
                : navigator.userAgent.includes('Windows') ? 'Windows PC'
                : 'Unknown Device';

      const ch = await this.bleService.getCharacteristic(STRING_CHAR_UUID);
      // Send RFID tag
      await ch.writeValue(new TextEncoder().encode('RFID:' + this.sampleTagId));
      this._logMsg('sent', 'RFID:' + this.sampleTagId);
      await new Promise(r => setTimeout(r, 200));
      // Send GPS
      await ch.writeValue(new TextEncoder().encode('GPS:' + gps));
      this._logMsg('sent', 'GPS:' + gps);
      await new Promise(r => setTimeout(r, 200));
      // Send device name
      await ch.writeValue(new TextEncoder().encode('DEVICE:' + dev));
      this._logMsg('sent', 'DEVICE:' + dev);
      await new Promise(r => setTimeout(r, 200));
      // Trigger ESP32 to write to about.txt
      await ch.writeValue(new TextEncoder().encode(`NEWSAMPL:${this.sampleTagId},${gps}`));
      this._logMsg('sent', `NEWSAMPL:${this.sampleTagId},${gps}`);

      this.sampleSendStatus = 'done';
      setTimeout(() => this._closeSampleModal(), 2500);
    } catch {
      this.sampleSendStatus = 'error';
    }
  }

  /* ── Message log ── */
  private _logMsg(direction: 'sent' | 'received', text: string) {
    this.messages = [...this.messages, { time: new Date().toLocaleString(), direction, text }];
  }

  private _clearMessages() { this.messages = []; }

  /* ── LED helpers ── */
  private _ledColor(s: LedStatus)  {
    return s === 'ok' ? '#00ffa3' : s === 'warn' ? '#ffc107' : s === 'error' ? '#f44336' : '#4a5568';
  }
  private _ledGlow(s: LedStatus) {
    return s === 'ok'    ? '0 0 10px rgba(0,255,163,0.7)'
         : s === 'warn'  ? '0 0 10px rgba(255,193,7,0.7)'
         : s === 'error' ? '0 0 10px rgba(244,67,54,0.7)'
         : 'none';
  }
  private _ledLabel(s: LedStatus) {
    return s === 'ok' ? 'OK' : s === 'warn' ? 'WARN' : s === 'error' ? 'ERROR' : '—';
  }
  private _battColor(pct: number) {
    return pct > 60 ? '#00ffa3' : pct > 30 ? '#ffc107' : '#f44336';
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
      padding: 0 0 80px;
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

    .clock-tag {
      margin-left: auto;
      font-family: var(--mono);
      font-size: 0.65rem;
      color: var(--muted);
      letter-spacing: 0.06em;
      white-space: nowrap;
    }

    /* ── Content ── */
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
      background: linear-gradient(90deg, transparent, var(--ok), transparent);
    }

    .card-title {
      font-family: var(--mono);
      font-size: 0.72rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ok);
      margin-bottom: 16px;
    }

    /* ── Connection ── */
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

    .btn:hover   { opacity: 0.88; transform: translateY(-1px); }
    .btn:active  { transform: translateY(0); }
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

    /* ── Status LEDs ── */
    .led-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .led-item {
      display: flex;
      align-items: center;
      gap: 12px;
      background: rgba(255,255,255,0.02);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 14px;
    }

    .led-dot {
      width: 14px; height: 14px;
      border-radius: 50%;
      flex-shrink: 0;
      transition: background 0.4s, box-shadow 0.4s;
    }

    .led-dot.pulse-warn {
      animation: pulse-warn 1.5s infinite;
    }
    .led-dot.pulse-error {
      animation: pulse-error 0.8s infinite;
    }

    @keyframes pulse-warn {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.4; }
    }
    @keyframes pulse-error {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.3; }
    }

    .led-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .led-name {
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text);
    }

    .led-status-text {
      font-family: var(--mono);
      font-size: 0.62rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .led-status-text.ok    { color: #00ffa3; }
    .led-status-text.warn  { color: #ffc107; }
    .led-status-text.error { color: #f44336; }
    .led-status-text.unknown { color: var(--muted); }

    /* ── Battery ── */
    .batt-row {
      display: flex;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }

    .batt-voltage {
      font-family: var(--mono);
      font-size: 2rem;
      font-weight: 700;
      color: var(--accent);
      letter-spacing: 0.04em;
      line-height: 1;
    }

    .batt-voltage span {
      font-size: 0.9rem;
      color: var(--muted);
    }

    .batt-meta {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .batt-pct {
      font-family: var(--mono);
      font-size: 1.3rem;
      font-weight: 700;
      line-height: 1;
    }

    .batt-hours {
      font-family: var(--mono);
      font-size: 0.7rem;
      color: var(--muted);
      letter-spacing: 0.04em;
    }

    .batt-bar-wrap {
      width: 100%;
      height: 8px;
      background: rgba(255,255,255,0.05);
      border: 1px solid var(--border);
      border-radius: 4px;
      overflow: hidden;
    }

    .batt-bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.6s ease, background 0.4s;
    }

    .batt-no-data {
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--muted);
      letter-spacing: 0.06em;
    }

    /* ── Sampling ── */
    .sampling-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }

    .btn-sample-start {
      background: linear-gradient(135deg, #00b36b, var(--ok));
      color: #001a0e;
      font-family: var(--display);
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 12px 22px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.15s;
      box-shadow: 0 0 14px rgba(0,255,163,0.2);
    }

    .btn-sample-start:hover   { opacity: 0.88; transform: translateY(-1px); }
    .btn-sample-start:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }

    .btn-sample-stop {
      background: transparent;
      border: 1px solid #f44336;
      color: #f44336;
      font-family: var(--display);
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 12px 22px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s, transform 0.15s;
    }

    .btn-sample-stop:hover   { background: rgba(244,67,54,0.1); transform: translateY(-1px); }
    .btn-sample-stop:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }

    .sampling-timer {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
    }

    .sampling-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--ok);
      box-shadow: 0 0 8px rgba(0,255,163,0.6);
      animation: blink 1s infinite;
    }

    .sampling-elapsed {
      font-family: var(--mono);
      font-size: 0.85rem;
      letter-spacing: 0.06em;
      color: var(--ok);
    }

    .sampling-idle {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--muted);
      letter-spacing: 0.06em;
    }

    /* ── Insert New Sample button ── */
    .btn-new-sample {
      width: 100%;
      background: linear-gradient(135deg, rgba(124,58,237,0.15), rgba(0,229,255,0.1));
      border: 1px solid rgba(124,58,237,0.5);
      color: var(--accent2);
      font-family: var(--display);
      font-size: 0.85rem;
      font-weight: 700;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      padding: 16px;
      border-radius: 10px;
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s, transform 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }

    .btn-new-sample:hover {
      border-color: var(--accent2);
      background: rgba(124,58,237,0.2);
      transform: translateY(-1px);
    }
    .btn-new-sample:active { transform: translateY(0); }
    .btn-new-sample:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }

    .btn-new-sample svg { width: 18px; height: 18px; fill: var(--accent2); flex-shrink: 0; }

    /* ── SD Card Log ── */
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

    /* ── Message log ── */
    .msg-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }

    .msg-log {
      max-height: 180px;
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
      text-decoration: none;
      display: inline-block;
      transition: color 0.2s, border-color 0.2s;
    }
    .nav-back:hover { color: var(--accent); border-color: var(--accent); }

    /* ── Modal overlay ── */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.75);
      backdrop-filter: blur(4px);
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .modal-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 28px 24px;
      width: 100%;
      max-width: 400px;
      position: relative;
      overflow: hidden;
    }

    .modal-card::after {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--accent2), transparent);
    }

    .modal-title {
      font-family: var(--mono);
      font-size: 0.75rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--accent2);
      margin-bottom: 24px;
    }

    .modal-btn-close {
      position: absolute;
      top: 16px; right: 16px;
      background: none;
      border: 1px solid var(--border);
      color: var(--muted);
      font-family: var(--mono);
      font-size: 0.65rem;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      transition: color 0.2s, border-color 0.2s;
    }
    .modal-btn-close:hover { color: var(--warn); border-color: var(--warn); }

    /* NFC pulse animation in modal */
    .nfc-pulse-wrap {
      display: flex;
      justify-content: center;
      margin-bottom: 20px;
    }

    .pulse-ring-container {
      position: relative;
      width: 100px; height: 100px;
      display: flex; align-items: center; justify-content: center;
    }

    .pulse-ring {
      position: absolute;
      border-radius: 50%;
      border: 1.5px solid var(--accent2);
      opacity: 0;
    }
    .pulse-ring:nth-child(1) { width: 44px; height: 44px; }
    .pulse-ring:nth-child(2) { width: 66px; height: 66px; }
    .pulse-ring:nth-child(3) { width: 88px; height: 88px; }

    .scanning-active .pulse-ring                  { animation: ripple 2.4s ease-out infinite; }
    .scanning-active .pulse-ring:nth-child(2)     { animation-delay: 0.6s; }
    .scanning-active .pulse-ring:nth-child(3)     { animation-delay: 1.2s; }

    @keyframes ripple {
      0%   { transform: scale(0.7); opacity: 0.8; }
      100% { transform: scale(1.1); opacity: 0; }
    }

    .nfc-center-icon {
      width: 40px; height: 40px;
      border-radius: 50%;
      border: 1.5px solid var(--accent2);
      background: rgba(124,58,237,0.12);
      display: flex; align-items: center; justify-content: center;
      z-index: 1;
    }

    .nfc-center-icon.ok    { border-color: var(--ok);   background: rgba(0,255,163,0.1); }
    .nfc-center-icon.error { border-color: var(--warn);  background: rgba(255,107,53,0.1); }

    .nfc-center-icon svg { width: 20px; height: 20px; stroke: var(--accent2); fill: none; stroke-width: 2; }
    .nfc-center-icon.ok  svg  { stroke: var(--ok); }
    .nfc-center-icon.error svg { stroke: var(--warn); }

    .modal-status-text {
      font-family: var(--mono);
      font-size: 0.75rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted);
      text-align: center;
      margin-bottom: 16px;
    }
    .modal-status-text.scanning { color: var(--accent2); }
    .modal-status-text.ok       { color: var(--ok); }
    .modal-status-text.error    { color: var(--warn); }

    .modal-data-row {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(255,255,255,0.02);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 10px;
    }

    .modal-data-label {
      font-family: var(--mono);
      font-size: 0.62rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      flex-shrink: 0;
      width: 36px;
    }

    .modal-data-value {
      font-family: var(--mono);
      font-size: 0.78rem;
      color: var(--text);
      word-break: break-all;
    }

    .modal-data-value.ok { color: var(--ok); }

    .modal-actions {
      display: flex;
      gap: 10px;
      margin-top: 18px;
    }

    .btn-modal-scan {
      flex: 1;
      background: linear-gradient(135deg, var(--accent2), var(--accent));
      color: #fff;
      font-family: var(--display);
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 13px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.15s;
    }
    .btn-modal-scan:hover   { opacity: 0.88; transform: translateY(-1px); }
    .btn-modal-scan:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }

    .btn-modal-send {
      flex: 1;
      background: linear-gradient(135deg, #00b36b, var(--ok));
      color: #001a0e;
      font-family: var(--display);
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 13px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.15s;
      box-shadow: 0 0 12px rgba(0,255,163,0.2);
    }
    .btn-modal-send:hover   { opacity: 0.88; transform: translateY(-1px); }
    .btn-modal-send:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }

    .send-done-msg {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--ok);
      letter-spacing: 0.08em;
      text-align: center;
      margin-top: 12px;
    }
    .send-err-msg {
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--warn);
      letter-spacing: 0.08em;
      text-align: center;
      margin-top: 12px;
    }

    /* ── Misc ── */
    @media (max-width: 480px) {
      .led-grid { grid-template-columns: 1fr; }
      .card { padding: 16px; }
      .sampling-row { gap: 8px; }
      .btn-sample-start, .btn-sample-stop { padding: 11px 16px; font-size: 0.72rem; }
    }
  `;

  /* ── Render helpers ── */
  private _renderLed(name: string, status: LedStatus) {
    const color = this._ledColor(status);
    const glow  = this._ledGlow(status);
    const label = this._ledLabel(status);
    const pulseClass = status === 'warn' ? 'pulse-warn' : status === 'error' ? 'pulse-error' : '';
    return html`
      <div class="led-item">
        <div class="led-dot ${pulseClass}" style="background:${color};box-shadow:${glow};"></div>
        <div class="led-info">
          <span class="led-name">${name}</span>
          <span class="led-status-text ${status}">${label}</span>
        </div>
      </div>
    `;
  }

  private _renderSampleModal() {
    const isScanning = this.sampleScanStatus === 'scanning';
    const detected   = this.sampleScanStatus === 'detected';
    const scanErr    = this.sampleScanStatus === 'error' || this.sampleScanStatus === 'no_nfc';
    const canSend    = detected && this.connectionStatus === 'connected';

    return html`
      <div class="modal-overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) this._closeSampleModal(); }}>
        <div class="modal-card">
          <div class="modal-title">Insert New Sample</div>
          <button class="modal-btn-close" @click=${this._closeSampleModal}>Close</button>

          <!-- NFC scanning animation -->
          <div class="nfc-pulse-wrap">
            <div class="pulse-ring-container ${isScanning ? 'scanning-active' : ''}">
              <div class="pulse-ring"></div>
              <div class="pulse-ring"></div>
              <div class="pulse-ring"></div>
              <div class="nfc-center-icon ${detected ? 'ok' : scanErr ? 'error' : ''}">
                <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                  <path d="M8.5 8.5c1-1 2.3-1.5 3.5-1.5s2.5.5 3.5 1.5"/>
                  <path d="M6 6c1.7-1.7 4-2.7 6-2.7s4.3 1 6 2.7"/>
                  <circle cx="12" cy="14" r="1.5" fill="currentColor" stroke="none"/>
                </svg>
              </div>
            </div>
          </div>

          <!-- Status text -->
          <div class="modal-status-text ${isScanning ? 'scanning' : detected ? 'ok' : scanErr ? 'error' : ''}">
            ${this.sampleScanStatus === 'idle'     ? 'Tap "Scan Tag" to begin'
            : this.sampleScanStatus === 'scanning' ? 'Hold NFC tag near device…'
            : this.sampleScanStatus === 'detected' ? 'Tag detected!'
            : this.sampleScanStatus === 'no_nfc'   ? 'NFC not available on this device'
            :                                        'Could not read tag — try again'}
          </div>

          <!-- Tag ID row -->
          <div class="modal-data-row">
            <span class="modal-data-label">Tag</span>
            <span class="modal-data-value ${detected ? 'ok' : ''}">
              ${this.sampleTagId || '—'}
            </span>
          </div>

          <!-- GPS row -->
          <div class="modal-data-row">
            <span class="modal-data-label">GPS</span>
            <span class="modal-data-value ${this.sampleGpsStatus === 'got' ? 'ok' : ''}">
              ${this.sampleGpsStatus === 'idle'        ? '—'
              : this.sampleGpsStatus === 'getting'     ? 'Acquiring…'
              : this.sampleGpsStatus === 'unavailable' ? 'Unavailable'
              : this.sampleGps}
            </span>
          </div>

          <!-- Actions -->
          <div class="modal-actions">
            ${!detected ? html`
              <button class="btn-modal-scan"
                ?disabled=${isScanning || this.sampleScanStatus === 'no_nfc'}
                @click=${isScanning ? this._stopNfcScan.bind(this) : this._startNfcScan.bind(this)}>
                ${isScanning ? 'Stop' : 'Scan Tag'}
              </button>
            ` : ''}

            ${detected ? html`
              <button class="btn-modal-send"
                ?disabled=${!canSend || this.sampleSendStatus === 'sending' || this.sampleSendStatus === 'done'}
                @click=${this._sendNewSample}>
                ${this.sampleSendStatus === 'sending' ? 'Sending…'
                : this.sampleSendStatus === 'done'    ? 'Sent!'
                : 'Send to Device'}
              </button>
            ` : ''}
          </div>

          ${this.sampleSendStatus === 'done'  ? html`<div class="send-done-msg">Sample registered on ESP32 SD card.</div>` : ''}
          ${this.sampleSendStatus === 'error' ? html`<div class="send-err-msg">Send failed. Check BLE connection.</div>`    : ''}
        </div>
      </div>
    `;
  }

  /* ── Render ── */
  render() {
    const isConnected = this.connectionStatus === 'connected';
    const hasBatt     = this.battVoltage > 0 || this.battPercent > 0;
    const battColor   = this._battColor(this.battPercent);
    const isRunning   = this.samplingState === 'running';

    return html`
      <main>
        <!-- ── Page header ── -->
        <div class="page-header">
          <div class="logo-icon">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6 2.69-6 6-6zm0 2c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 2a2 2 0 110 4 2 2 0 010-4z"/></svg>
          </div>
          <span class="page-title">Device</span>
          <span class="clock-tag">${this.clock}</span>
        </div>

        <div class="content">

          <!-- ── BLE compatibility warning ── -->
          ${!this.bleAvailable ? html`
            <div class="compat-box">
              Web Bluetooth is not available in this browser.
              Use Chrome on Android or enable the experimental flag on desktop Chrome.
            </div>
          ` : ''}

          <!-- ── Connection card ── -->
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
                : this.connectionStatus === 'connecting'   ? 'Connecting…'
                : this.connectionStatus === 'connected'    ? 'Connected'
                :                                            'Connection Failed'}
              </span>
            </div>
          </div>

          <!-- ── Status LEDs card ── -->
          <div class="card">
            <div class="card-title">Component Status</div>
            <div class="led-grid">
              ${this._renderLed('Fan',       this.deviceStatus.fan)}
              ${this._renderLed('Sensor',    this.deviceStatus.sensor)}
              ${this._renderLed('Servo',     this.deviceStatus.servo)}
              ${this._renderLed('Cartridge', this.deviceStatus.cartridge)}
              ${this._renderLed('SD Card',   this.deviceStatus.sdcard)}
            </div>
          </div>

          <!-- ── Battery card ── -->
          <div class="card">
            <div class="card-title">Battery</div>
            ${hasBatt ? html`
              <div class="batt-row">
                <div class="batt-voltage">
                  ${this.battVoltage.toFixed(2)}<span> V</span>
                </div>
                <div class="batt-meta">
                  <span class="batt-pct" style="color:${battColor};">${this.battPercent}%</span>
                  <span class="batt-hours">≈ ${this.battHours}h sampling remaining</span>
                </div>
              </div>
              <div class="batt-bar-wrap">
                <div class="batt-bar-fill"
                  style="width:${this.battPercent}%;background:${battColor};"></div>
              </div>
            ` : html`
              <div class="batt-no-data">
                No battery data received yet.
                Connect to device to get live readings.
              </div>
            `}
          </div>

          <!-- ── Sampling control card ── -->
          <div class="card">
            <div class="card-title">Sampling Control</div>
            <div class="sampling-row">
              <button class="btn-sample-start"
                ?disabled=${!isConnected || isRunning}
                @click=${this._startSampling}>
                ▶ Start Sampling
              </button>
              <button class="btn-sample-stop"
                ?disabled=${!isConnected || !isRunning}
                @click=${this._stopSampling}>
                ■ Stop Sampling
              </button>
              <div class="sampling-timer">
                ${isRunning ? html`
                  <div class="sampling-dot"></div>
                  <span class="sampling-elapsed">${this.samplingElapsed}</span>
                ` : html`
                  <span class="sampling-idle">
                    ${this.samplingElapsed === '—' ? 'Not running' : `Stopped at ${this.samplingElapsed}`}
                  </span>
                `}
              </div>
            </div>

            <!-- Insert New Sample -->
            <button class="btn-new-sample"
              ?disabled=${!isConnected}
              @click=${this._openSampleModal}>
              <svg viewBox="0 0 24 24"><path d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z"/></svg>
              Insert New Sample
            </button>
          </div>

          <!-- ── SD Card Log card ── -->
          <div class="card">
            <div class="card-title">SD Card Log</div>
            <div class="conn-row">
              <button class="btn btn-connect"
                ?disabled=${!isConnected || this.logTransferStatus === 'requesting' || this.logTransferStatus === 'receiving'}
                @click=${this._requestLog}>
                ${this.logTransferStatus === 'requesting' ? 'Requesting…'
                : this.logTransferStatus === 'receiving'  ? `Receiving… (${this.logLinesReceived} lines)`
                :                                           'Request Log'}
              </button>
              ${this.logTransferStatus === 'error' ? html`
                <span class="status-text failed">Failed to read log</span>
              ` : ''}
            </div>

            ${hasLogData() || this.logTransferStatus === 'done' ? html`
              <div class="conn-row" style="margin-top:10px;">
                <a class="btn btn-connect" href="${resolveRouterPath('log')}"
                   style="text-decoration:none;text-align:center;">
                  View Log Data
                </a>
                <button class="btn-clear-log" @click=${this._clearLocalLog}>
                  Clear Local Data
                </button>
              </div>
            ` : ''}
          </div>

          <!-- ── Messages card ── -->
          <div class="card">
            <div class="msg-header">
              <div class="card-title" style="margin-bottom:0;">Messages</div>
              ${this.messages.length > 0
                ? html`<button class="btn-clear-log" @click=${this._clearMessages}>Clear</button>`
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

          <!-- ── Back nav ── -->
          <div>
            <a class="nav-back" href="${resolveRouterPath()}">← Back to Home</a>
          </div>

        </div>
      </main>

      <!-- ── Insert New Sample modal ── -->
      ${this.showSampleModal ? this._renderSampleModal() : ''}
    `;
  }
}
