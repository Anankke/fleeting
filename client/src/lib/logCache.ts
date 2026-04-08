import type { LogEntry } from './logRegex';

export interface LogReaderFileState {
  offset: number;
  size: number;
  characterName: string;
  language: string;
}

export type LogReaderScanState = Record<string, LogReaderFileState>;

export interface BufferedLogEntry {
  timestamp: number;
  entry: LogEntry;
}

export interface PilotSessionCache {
  version: 1;
  cachedAt: number;
  selectedCharId: number | string | null;
  allEntries: BufferedLogEntry[];
  perCharacterEntries: Record<string, BufferedLogEntry[]>;
  liveEntries: LogEntry[];
}

const IDB_NAME = 'peld-logreader';
const IDB_STORE = 'handles';

export const IDB_KEYS = {
  handle: 'logDir',
  scanState: 'logScanState',
  pilotSession: 'pilotSessionCache',
} as const;

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveIdbValue<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openIdb();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Storage is an optimization only.
  }
}

export async function loadIdbValue<T>(key: string): Promise<T | null> {
  try {
    const db = await openIdb();
    const tx = db.transaction(IDB_STORE, 'readonly');
    const result = await new Promise<T | undefined>((resolve, reject) => {
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result ?? null;
  } catch {
    return null;
  }
}

export async function deleteIdbValue(key: string): Promise<void> {
  try {
    const db = await openIdb();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore cache deletion failures.
  }
}
