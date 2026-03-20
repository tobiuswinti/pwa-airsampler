// Global store for log data — persisted to localStorage so it survives navigation and disconnects

export interface LogDataRow {
  timestamp: string;
  source: string;
  values: string[];
}

export interface AboutData {
  rfidTag: string;
  gpsLat: string;
  gpsLng: string;
  deviceName: string;
  logStart: string;
  logEnd: string;
}

const STORAGE_KEY = 'airsampler_log_raw';
const ABOUT_STORAGE_KEY = 'airsampler_about';
const RFID_STORAGE_KEY = 'airsampler_last_rfid';

let _logData: LogDataRow[] = [];
let _rawLines: string[] = [];
const _listeners: Array<() => void> = [];

// Load from localStorage on module init
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    _rawLines = JSON.parse(stored);
    _logData = parseLogLines(_rawLines);
  }
} catch { /* ignore */ }

export function setLogData(rows: LogDataRow[], raw: string[]) {
  _logData = rows;
  _rawLines = raw;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(raw)); } catch { /* ignore */ }
  _listeners.forEach(fn => fn());
}

export function getLogData(): LogDataRow[] {
  return _logData;
}

export function getRawLines(): string[] {
  return _rawLines;
}

export function hasLogData(): boolean {
  return _rawLines.length > 0;
}

export function clearLogData() {
  _logData = [];
  _rawLines = [];
  _aboutData = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ABOUT_STORAGE_KEY);
  } catch { /* ignore */ }
  _listeners.forEach(fn => fn());
}

// ── About metadata ──────────────────────────────────────────────────────
let _aboutData: AboutData | null = null;

try {
  const storedAbout = localStorage.getItem(ABOUT_STORAGE_KEY);
  if (storedAbout) _aboutData = JSON.parse(storedAbout);
} catch { /* ignore */ }

export function setAboutData(about: AboutData) {
  _aboutData = about;
  try { localStorage.setItem(ABOUT_STORAGE_KEY, JSON.stringify(about)); } catch { /* ignore */ }
  _listeners.forEach(fn => fn());
}

export function getAboutData(): AboutData | null {
  return _aboutData;
}

export function parseAboutLines(lines: string[]): AboutData {
  const about: AboutData = { rfidTag: '', gpsLat: '', gpsLng: '', deviceName: '', logStart: '', logEnd: '' };
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('RFID:'))    about.rfidTag    = trimmed.substring(5).trim();
    if (trimmed.startsWith('GPS_LAT:')) about.gpsLat     = trimmed.substring(8).trim();
    if (trimmed.startsWith('GPS_LNG:')) about.gpsLng     = trimmed.substring(8).trim();
    if (trimmed.startsWith('DEVICE:'))  about.deviceName = trimmed.substring(7).trim();
    if (trimmed.startsWith('START:'))   about.logStart   = trimmed.substring(6).trim();
    if (trimmed.startsWith('END:'))     about.logEnd     = trimmed.substring(4).trim();
  }
  return about;
}

// ── RFID tag persistence (across pages) ─────────────────────────────────
export function setLastRfidTag(tag: string) {
  try { localStorage.setItem(RFID_STORAGE_KEY, tag); } catch { /* ignore */ }
}

export function getLastRfidTag(): string {
  try { return localStorage.getItem(RFID_STORAGE_KEY) ?? ''; } catch { return ''; }
}

export function onLogDataChanged(fn: () => void) {
  _listeners.push(fn);
  return () => {
    const idx = _listeners.indexOf(fn);
    if (idx >= 0) _listeners.splice(idx, 1);
  };
}

export function parseLogLines(lines: string[]): LogDataRow[] {
  const rows: LogDataRow[] = [];
  let currentTime = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Time marker: [TIME] 2025-03-13 14:30:22
    if (trimmed.startsWith('[TIME]')) {
      currentTime = trimmed.substring(7).trim();
      continue;
    }

    // Data line: Source,val1,val2,...
    const parts = trimmed.split(',');
    if (parts.length >= 2) {
      rows.push({
        timestamp: currentTime,
        source: parts[0].trim(),
        values: parts.slice(1).map(v => v.trim()),
      });
    }
  }

  return rows;
}
