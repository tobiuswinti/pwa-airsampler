// Uploads locally-stored DeviceRuns to Firestore whenever the app is online.
// Import this module once (from app-index.ts) to activate auto-upload.

import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { DeviceRun, getDeviceRuns, markRunUploaded } from './device-log-store';

const COLLECTION = 'device_runs';

// ── Upload a single run ────────────────────────────────────────────────────

export async function uploadRun(run: DeviceRun): Promise<string> {
  // Serialise rows as CSV strings to keep the Firestore document compact
  const csvRows = run.rows.map(r => r.join(','));

  const docRef = await addDoc(collection(db, COLLECTION), {
    deviceRunId:  run.id,
    tagId:        run.meta.tagId   || null,
    startTime:    run.meta.startTime,
    downloadedAt: run.downloadedAt,
    uploadedAt:   Timestamp.now(),
    meta:         { ...run.meta },
    fields:       run.fields,
    units:        run.units,
    csvRows,
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
  const pending = all.filter(r => !r.firebaseId).length;
  _listeners.forEach(fn => fn(pending, all.length));
}

export async function uploadPendingRuns(): Promise<void> {
  if (_uploading || !navigator.onLine) return;
  _uploading = true;
  _notify();

  const pending = getDeviceRuns().filter(r => !r.firebaseId);
  for (const run of pending) {
    try {
      const firebaseId = await uploadRun(run);
      markRunUploaded(run.id, firebaseId, Date.now());
    } catch (err) {
      console.warn(`[upload] run ${run.id} failed:`, err);
      // Don't abort — try remaining runs
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
