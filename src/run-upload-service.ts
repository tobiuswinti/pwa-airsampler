// Uploads locally-stored DeviceRuns to Firestore whenever the app is online.
// Import this module once (from app-index.ts) to activate auto-upload.

import { collection, addDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { DeviceRun, getDeviceRuns, markRunUploaded } from './device-log-store';

const COLLECTION = 'device_runs';

// ── Upload a single run ────────────────────────────────────────────────────

export async function uploadRun(run: DeviceRun): Promise<string> {
  const csvRows = run.rows.map(r => r.join(','));

  const docRef = await addDoc(collection(db, COLLECTION), {
    deviceRunId:  run.id,
    runId:        run.meta.runId   || null,
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
          // Already uploaded — mark as such with the existing document ID
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
