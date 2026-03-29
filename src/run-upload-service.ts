// Uploads locally-stored DeviceRuns to Firestore whenever the app is online.
// Import this module once (from app-index.ts) to activate auto-upload.

import { collection, addDoc, getDocs, query, where, Timestamp, doc } from 'firebase/firestore';
import { db } from './firebase';
import { DeviceRun, getDeviceRuns, markRunUploaded } from './device-log-store';
import { authService } from './auth-service';

declare const __APP_VERSION__: string;

const COLLECTION = 'device_runs';

// ── Upload a single run (schema v2) ───────────────────────────────────────

export async function uploadRun(run: DeviceRun): Promise<string> {
  // Columnar time-series: one object per field, data array alongside metadata
  const columns = run.fields.map((name, i) => ({
    name,
    unit: run.units[i] ?? '',
    data: run.rows.map(row => {
      const v = parseFloat(row[i] ?? '');
      return isFinite(v) ? v : null;
    }),
  }));

  // Duration from timestamp column if present, else rowCount × interval
  const tsIdx    = run.fields.indexOf('timestamp');
  const duration = tsIdx >= 0 && run.rows.length >= 2
    ? Number(run.rows[run.rows.length - 1][tsIdx]) - Number(run.rows[0][tsIdx])
    : run.rows.length * run.meta.interval;

  // Location as native numbers
  const latN = run.meta.lat ? parseFloat(run.meta.lat) : NaN;
  const lonN = run.meta.lon ? parseFloat(run.meta.lon) : NaN;
  const location = isFinite(latN) && isFinite(lonN) ? { lat: latN, lon: lonN } : null;

  // States as array
  const states = run.meta.states
    ? run.meta.states.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  // Uploader as DocumentReference to users/{uid}
  const user       = authService.user;
  const uploadedBy = user ? doc(db, 'users', user.uid) : null;

  const docRef = await addDoc(collection(db, COLLECTION), {
    schemaVersion: 2,
    runId:         run.meta.runId      || null,
    tagId:         run.meta.tagId      || null,
    deviceName:    run.meta.deviceName || null,
    startTime:     Timestamp.fromMillis(run.meta.startTime),
    downloadedAt:  Timestamp.fromMillis(run.downloadedAt),
    uploadedAt:    Timestamp.now(),
    interval:      run.meta.interval,
    duration,
    rowCount:      run.rows.length,
    location,
    states,
    uploadedBy,
    appVersion:    typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown',
    columns,
  });

  return docRef.id;
}

// ── Upload all pending runs ────────────────────────────────────────────────

let _uploading = false;
const _listeners: Array<(pending: number, total: number) => void> = [];

export function onUploadProgress(fn: (pending: number, total: number) => void): () => void {
  _listeners.push(fn);
  return () => { const i = _listeners.indexOf(fn); if (i >= 0) _listeners.splice(i, 1); };
}

function _notify() {
  const all     = getDeviceRuns();
  const pending = all.filter(r => !r.firebaseId && !r.uploadError).length;
  _listeners.forEach(fn => fn(pending, all.length));
}

export async function uploadPendingRuns(): Promise<void> {
  if (_uploading || !navigator.onLine) return;
  _uploading = true;
  _notify();

  const pending = getDeviceRuns().filter(r => !r.firebaseId && !r.uploadError);
  for (const run of pending) {
    try {
      // Check for existing cloud run with the same runId (deduplication by UUID)
      if (run.meta.runId) {
        const snap = await getDocs(query(
          collection(db, COLLECTION),
          where('runId', '==', run.meta.runId),
        ));
        if (!snap.empty) {
          markRunUploaded(run.id, snap.docs[0].id, Date.now());
          _notify();
          continue;
        }
      }

      const firebaseId = await uploadRun(run);
      markRunUploaded(run.id, firebaseId, Date.now());
    } catch (err) {
      console.warn(`[upload] run ${run.id} failed:`, err);
    }
    _notify();
  }

  _uploading = false;
  _notify();
}

export function isUploading(): boolean { return _uploading; }

// ── Auto-trigger ───────────────────────────────────────────────────────────

window.addEventListener('online', () => uploadPendingRuns());

// Try immediately if already online
if (navigator.onLine) uploadPendingRuns();
