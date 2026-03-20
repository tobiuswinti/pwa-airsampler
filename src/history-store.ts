// ── History store — Firebase Firestore CRUD for uploaded logs ────────────────

import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  deleteDoc,
  doc,
  orderBy,
  query,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { AboutData } from './log-store';

export interface HistoryEntry {
  id: string;
  rawLines: string[];
  about: AboutData | null;
  uploadedAt: Date;
  rowCount: number;
}

const COLLECTION = 'logs';

export async function uploadLog(
  rawLines: string[],
  about: AboutData | null
): Promise<string> {
  // Count data rows (lines that aren't [TIME] markers or empty)
  const rowCount = rawLines.filter(
    (l) => l.trim() && !l.trim().startsWith('[TIME]')
  ).length;

  const docRef = await addDoc(collection(db, COLLECTION), {
    rawLines,
    about: about ?? null,
    uploadedAt: Timestamp.now(),
    rowCount,
  });

  return docRef.id;
}

export async function getAllLogs(): Promise<HistoryEntry[]> {
  const q = query(
    collection(db, COLLECTION),
    orderBy('uploadedAt', 'desc')
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      rawLines: data.rawLines ?? [],
      about: data.about ?? null,
      uploadedAt: (data.uploadedAt as Timestamp).toDate(),
      rowCount: data.rowCount ?? 0,
    };
  });
}

export async function getLog(id: string): Promise<HistoryEntry | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;

  const data = snap.data();
  return {
    id: snap.id,
    rawLines: data.rawLines ?? [],
    about: data.about ?? null,
    uploadedAt: (data.uploadedAt as Timestamp).toDate(),
    rowCount: data.rowCount ?? 0,
  };
}

export async function deleteLog(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
