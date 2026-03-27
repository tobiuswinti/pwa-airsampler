// Shared BLE singleton — persists across page navigation
// All pages that need BLE communicate through this service.

import { hasDeviceRun } from './device-log-store';

// ── UUIDs ──────────────────────────────────────────────────────────────────
const DEVICE_NAME  = 'AirSampler';
const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const CMD_WRITE    = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const CMD_NOTIFY   = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const LOG_NOTIFY   = '6e400004-b5a3-f393-e0a9-e50e24dcca9e';
const STATE_NOTIFY = '6e400005-b5a3-f393-e0a9-e50e24dcca9e';

// ── Public types ───────────────────────────────────────────────────────────
export type ConnStatus = 'disconnected' | 'connecting' | 'connected' | 'failed';

export interface LiveState {
  ts: string;
  voltage: number; current: number; soc: number; power: number; tte: number;
  fanRpm: number; temperature: number; humidity: number; pressure: number;
  servoMm: number; flowrate: number; flowrateSP: number; samplingState: string;
  elapsedS: number; remainingS: number;
}

// ── Line buffer ────────────────────────────────────────────────────────────
function makeLineBuffer(onLine: (line: string) => void) {
  let buf = '';
  return (chunk: string) => {
    buf += chunk;
    let i: number;
    while ((i = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, i).trimEnd();
      buf = buf.slice(i + 1);
      if (line.length) onLine(line);
    }
  };
}

// ── Pending command ────────────────────────────────────────────────────────
interface PendingCmd {
  resolve: (lines: string[]) => void;
  lines: string[];
  inEnvelope: boolean;
}

// ── Service ────────────────────────────────────────────────────────────────
class BleService extends EventTarget {
  connStatus: ConnStatus = 'disconnected';
  liveState: LiveState | null = null;
  sysLog: string[] = [];
  unsyncedCount: number = 0;
  deviceRunIds: number[] = [];

  private bleDevice:  BluetoothDevice | null = null;
  private bleService: BluetoothRemoteGATTService | null = null;
  private writeChar:  BluetoothRemoteGATTCharacteristic | null = null;
  private isManualDisconnect = false;

  private cmdQueue: Array<{ cmd: string; resolve: (lines: string[]) => void }> = [];
  private pending: PendingCmd | null = null;
  private cmdBusy = false;

  private _prevSamplingState: string | null = null;

  private cmdLineBuffer   = makeLineBuffer(l => this._handleCmdLine(l));
  private logLineBuffer   = makeLineBuffer(l => {
    this.sysLog = [...this.sysLog.slice(-299), l];
    this.dispatchEvent(new CustomEvent('log-changed'));
  });
  private stateLineBuffer = makeLineBuffer(l => {
    try {
      const next = JSON.parse(l) as LiveState;
      const prev = this._prevSamplingState;
      this._prevSamplingState = next.samplingState;
      this.liveState = next;
      this.dispatchEvent(new CustomEvent('state-changed'));
      // Re-fetch run list when a sampling cycle finishes
      if (prev === 'running' && next.samplingState !== 'running') {
        this._refreshRunList();
      }
    } catch { /* ignore */ }
  });

  // ── Connection ────────────────────────────────────────────────────────────
  async connect(): Promise<void> {
    if (!navigator.bluetooth) return;
    try {
      this._setStatus('connecting');

      this.bleDevice = await navigator.bluetooth.requestDevice({
        filters: [{ name: DEVICE_NAME }],
        optionalServices: [SERVICE_UUID],
      });
      this.bleDevice.addEventListener('gattserverdisconnected', () => this._onDisconnected());

      const server = await this.bleDevice.gatt!.connect();
      this.bleService = await server.getPrimaryService(SERVICE_UUID);
      this.writeChar  = await this.bleService.getCharacteristic(CMD_WRITE);

      const cmdChar = await this.bleService.getCharacteristic(CMD_NOTIFY);
      cmdChar.addEventListener('characteristicvaluechanged', (e: Event) => {
        this.cmdLineBuffer(new TextDecoder().decode((e.target as BluetoothRemoteGATTCharacteristic).value!));
      });
      await cmdChar.startNotifications();

      const logChar = await this.bleService.getCharacteristic(LOG_NOTIFY);
      logChar.addEventListener('characteristicvaluechanged', (e: Event) => {
        this.logLineBuffer(new TextDecoder().decode((e.target as BluetoothRemoteGATTCharacteristic).value!));
      });
      await logChar.startNotifications();

      const stateChar = await this.bleService.getCharacteristic(STATE_NOTIFY);
      stateChar.addEventListener('characteristicvaluechanged', (e: Event) => {
        this.stateLineBuffer(new TextDecoder().decode((e.target as BluetoothRemoteGATTCharacteristic).value!));
      });
      await stateChar.startNotifications();

      this._setStatus('connected');
      this._initAfterConnect();
    } catch (err: any) {
      console.error('BLE connect failed:', err);
      this._setStatus('failed');
    }
  }

  disconnect(): void {
    this.isManualDisconnect = true;
    if (this.bleDevice?.gatt?.connected) this.bleDevice.gatt.disconnect();
    this.bleDevice    = null;
    this.liveState    = null;
    this.unsyncedCount = 0;
    this.deviceRunIds  = [];
    this._prevSamplingState = null;
    this._setStatus('disconnected');
  }

  // ── Command API ───────────────────────────────────────────────────────────
  sendCmd(cmd: string): Promise<string[]> {
    return new Promise(resolve => {
      this.cmdQueue.push({ cmd, resolve });
      if (!this.cmdBusy) this._flushQueue();
    });
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async _refreshRunList() {
    try {
      const lines = await this.sendCmd('listRuns');
      for (const l of lines) {
        const t = l.trim();
        if (!t.startsWith('{')) continue;
        try {
          const j = JSON.parse(t);
          if (Array.isArray(j['runs'])) {
            const ids: number[] = (j['runs'] as unknown[]).map(Number);
            this.deviceRunIds  = ids;
            this.unsyncedCount = ids.filter(id => !hasDeviceRun(id)).length;
            this.dispatchEvent(new CustomEvent('sync-check-changed'));
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  private async _initAfterConnect() {
    await this.sendCmd(`setTime -ts ${Math.floor(Date.now() / 1000)}`);
    // Check for unsynced runs after setTime completes
    try {
      const lines = await this.sendCmd('listRuns');
      for (const l of lines) {
        const t = l.trim();
        if (!t.startsWith('{')) continue;
        try {
          const j = JSON.parse(t);
          if (Array.isArray(j['runs'])) {
            const ids: number[] = (j['runs'] as unknown[]).map(Number);
            this.deviceRunIds  = ids;
            this.unsyncedCount = ids.filter(id => !hasDeviceRun(id)).length;
            this.dispatchEvent(new CustomEvent('sync-check-changed'));
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  private _setStatus(s: ConnStatus) {
    this.connStatus = s;
    this.dispatchEvent(new CustomEvent('status-changed'));
  }

  private _onDisconnected() {
    if (!this.isManualDisconnect) {
      this.isManualDisconnect = false;
      this.liveState = null;
      this._setStatus('disconnected');
    }
  }

  private _handleCmdLine(line: string) {
    if (!this.pending) return;

    if (line === 'ACK') { this.pending.inEnvelope = true; return; }

    if (line === 'DONE') {
      const lines = this.pending.lines;
      this.cmdBusy = false;
      const resolve = this.pending.resolve;
      this.pending = null;
      resolve(lines);
      this._flushQueue();
      return;
    }

    if (line.startsWith('ERROR') && !this.pending.inEnvelope) {
      this.cmdBusy = false;
      const resolve = this.pending.resolve;
      this.pending = null;
      resolve([line]);
      this._flushQueue();
      return;
    }

    if (this.pending.inEnvelope) this.pending.lines.push(line);
  }

  private async _flushQueue() {
    if (this.cmdBusy || this.cmdQueue.length === 0 || !this.writeChar) return;
    const { cmd, resolve } = this.cmdQueue.shift()!;
    this.cmdBusy = true;
    this.pending = { resolve, lines: [], inEnvelope: false };
    try {
      await this.writeChar.writeValueWithoutResponse(new TextEncoder().encode(cmd + '\n'));
    } catch (e) {
      console.error('BLE write failed:', e);
      this.cmdBusy = false;
      this.pending = null;
      resolve([`ERROR message="write failed"`]);
      this._flushQueue();
    }
  }
}

export const bleService = new BleService();
