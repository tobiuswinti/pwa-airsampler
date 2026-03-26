// Persists device log runs synced from the ESP32 via BLE.
// Each run is stored by its ID (filename on the device's SD card).

export interface DeviceRun {
  id: string;
  downloadedAt: number; // epoch ms
  lines: string[];
}

const STORAGE_KEY = 'airsampler_device_runs';

// In-memory cache: runId → DeviceRun
let _runs: Map<string, DeviceRun> = new Map();

const _listeners: Array<() => void> = [];

// Load from localStorage on module init
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const arr: DeviceRun[] = JSON.parse(stored);
    for (const r of arr) _runs.set(r.id, r);
  }
} catch { /* ignore */ }

function _persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(_runs.values())));
  } catch { /* ignore */ }
}

export function getDeviceRuns(): DeviceRun[] {
  return Array.from(_runs.values()).sort((a, b) => b.downloadedAt - a.downloadedAt);
}

export function hasDeviceRun(id: string): boolean {
  return _runs.has(id);
}

export function saveDeviceRun(run: DeviceRun): void {
  _runs.set(run.id, run);
  _persist();
  _listeners.forEach(fn => fn());
}

export function deleteDeviceRun(id: string): void {
  _runs.delete(id);
  _persist();
  _listeners.forEach(fn => fn());
}

export function onDeviceRunsChanged(fn: () => void): () => void {
  _listeners.push(fn);
  return () => {
    const idx = _listeners.indexOf(fn);
    if (idx >= 0) _listeners.splice(idx, 1);
  };
}
