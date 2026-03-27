// Persists device state-log runs synced from the ESP32 via BLE.

export interface RunMeta {
  startTime: number;   // epoch ms
  interval:  number;   // ms between rows
  tagId:     string;
  lat:       string;
  lon:       string;
  states:    string;
  runId?:    string;   // UUID assigned by device (stable across reboots)
}

export interface DeviceRun {
  id:           number;    // integer run index on device
  downloadedAt: number;    // epoch ms
  fields:       string[];  // header row 1 – field names
  units:        string[];  // header row 2 – units
  meta:         RunMeta;
  rows:         string[][];  // expanded (carry-forward applied) data rows, parallel to fields
  firebaseId?:       string;  // Firestore document ID once uploaded, undefined if pending
  cloudUploadedAt?:  number;  // epoch ms when successfully uploaded to cloud
  uploadError?:      string;  // set if upload failed
}

const STORAGE_KEY = 'airsampler_device_runs_v2';

// In-memory cache: runId → DeviceRun
let _runs: Map<number, DeviceRun> = new Map();

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
  return Array.from(_runs.values()).sort((a, b) => b.id - a.id);
}

export function hasDeviceRun(id: number): boolean {
  return _runs.has(id);
}

export function hasDeviceRunByRunId(runId: string): boolean {
  if (!runId) return false;
  for (const run of _runs.values()) {
    if (run.meta?.runId === runId) return true;
  }
  return false;
}

export function getDeviceRunByRunId(runId: string): DeviceRun | undefined {
  if (!runId) return undefined;
  for (const run of _runs.values()) {
    if (run.meta?.runId === runId) return run;
  }
  return undefined;
}

export function saveDeviceRun(run: DeviceRun): void {
  _runs.set(run.id, run);
  _persist();
  _listeners.forEach(fn => fn());
}

export function deleteDeviceRun(id: number): void {
  _runs.delete(id);
  _persist();
  _listeners.forEach(fn => fn());
}

export function markRunUploaded(id: number, firebaseId: string, cloudUploadedAt: number): void {
  const run = _runs.get(id);
  if (!run) return;
  _runs.set(id, { ...run, firebaseId, cloudUploadedAt });
  _persist();
  _listeners.forEach(fn => fn());
}

export function markRunUploadError(id: number, error: string): void {
  const run = _runs.get(id);
  if (!run) return;
  _runs.set(id, { ...run, uploadError: error });
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

/** Parse a meta line like "startTime=1711400000,interval=1000,tagId=ABC,lat=0,lon=0,states=..." */
export function parseMeta(metaLine: string): RunMeta {
  const kv: Record<string, string> = {};
  for (const part of metaLine.split(',')) {
    const eq = part.indexOf('=');
    if (eq >= 0) kv[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  // Device emits startTime in Unix seconds; normalise to ms for JS Date compatibility.
  const rawStart = Number(kv['startTime'] ?? 0);
  const startTime = rawStart < 1e12 ? rawStart * 1000 : rawStart;
  const result: RunMeta = {
    startTime,
    interval:  Number(kv['interval']  ?? 1000),
    tagId:     kv['tagId']  ?? '',
    lat:       kv['lat']    ?? '',
    lon:       kv['lon']    ?? '',
    states:    kv['states'] ?? '',
  };
  if (kv['runId']) result.runId = kv['runId'];
  return result;
}

/** Apply carry-forward encoding: empty cell → reuse value from previous row */
export function applyCarryForward(rawRows: string[][]): string[][] {
  const out: string[][] = [];
  const prev: string[] = [];
  for (const row of rawRows) {
    const filled = row.map((cell, i) => {
      const val = cell === '' ? (prev[i] ?? '') : cell;
      prev[i] = val;
      return val;
    });
    out.push(filled);
  }
  return out;
}
