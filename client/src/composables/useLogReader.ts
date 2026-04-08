/**
 * useLogReader.ts
 *
 * Composable that delegates EVE combat log polling and parsing to a Web Worker,
 * keeping the main thread free from file I/O pressure.
 *
 * The File System Access API (FileSystemDirectoryHandle etc.) is fully available
 * in dedicated workers on Chrome/Edge — the only browsers that support the API.
 *
 * The chosen directory handle is persisted in IndexedDB so it can be
 * re-opened automatically on subsequent page loads without a user prompt
 * (the browser re-verifies permission silently if the handle is still valid).
 */

import { ref, onUnmounted } from 'vue';
import type { LogEntry } from '../lib/logRegex';
import { IDB_KEYS, deleteIdbValue, loadIdbValue, saveIdbValue, type LogReaderScanState } from '../lib/logCache';

type EntryCallback = (entries: LogEntry[]) => void;

async function saveHandle(handle: FileSystemDirectoryHandle) {
  await saveIdbValue(IDB_KEYS.handle, handle);
}

async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  return loadIdbValue<FileSystemDirectoryHandle>(IDB_KEYS.handle);
}

async function clearHandle() {
  await deleteIdbValue(IDB_KEYS.handle);
}

// ── Composable ────────────────────────────────────────────────────────────────

function createWorker(): Worker {
  return new Worker(new URL('../workers/logReader.worker.ts', import.meta.url), { type: 'module' });
}

export function useLogReader() {
  const isReading    = ref(false);
  const isLoading    = ref(false);
  const error        = ref<string | null>(null);
  let worker: Worker | null = null;
  let entryCallback: EntryCallback = () => {};

  function onEntries(cb: EntryCallback) {
    entryCallback = cb;
  }

  function spawnWorker() {
    if (worker) return;
    worker = createWorker();
    worker.addEventListener('message', (evt: MessageEvent) => {
      const msg = evt.data as { type: string; entries?: LogEntry[]; message?: string; state?: LogReaderScanState };
      if (msg.type === 'entries' && msg.entries) {
        entryCallback(msg.entries);
      } else if (msg.type === 'scanState' && msg.state) {
        void saveIdbValue(IDB_KEYS.scanState, msg.state);
      } else if (msg.type === 'loading') {
        isLoading.value = true;
      } else if (msg.type === 'ready') {
        isLoading.value = false;
      } else if (msg.type === 'error' && msg.message) {
        error.value = msg.message;
      }
    });
  }

  function startWorker(handle: FileSystemDirectoryHandle, scanState: LogReaderScanState | null = null) {
    error.value = null;
    spawnWorker();
    worker!.postMessage({ type: 'start', handle, scanState });
    isReading.value = true;
  }

  /**
   * Open the EVE logs folder via the file-picker, persist the handle, and start
   * the worker. Throws AbortError (silently swallowed by callers) on cancel.
   */
  async function pickDirectory() {
    if (!('showDirectoryPicker' in window)) {
      error.value = 'File System Access API is not supported in this browser. Please use Chrome or Edge.';
      return;
    }
    const handle = await (window as any).showDirectoryPicker({ mode: 'read' }) as FileSystemDirectoryHandle;
    await saveHandle(handle);
    await deleteIdbValue(IDB_KEYS.scanState);
    await deleteIdbValue(IDB_KEYS.pilotSession);
    startWorker(handle, null);
  }

  /**
   * Attempt to restore the previously selected log directory without showing
   * a picker. Returns true if the handle was found and permission was granted,
   * false otherwise (caller should fall back to showing the picker button).
   */
  async function tryRestoreDirectory(): Promise<boolean> {
    const handle = await loadHandle();
    if (!handle) return false;
    try {
      // queryPermission tells us whether the handle is still accessible
      // without triggering a user-gesture requirement.
      const perm = await (handle as any).queryPermission({ mode: 'read' });
      if (perm === 'granted') {
        const scanState = await loadIdbValue<LogReaderScanState>(IDB_KEYS.scanState);
        startWorker(handle, scanState);
        return true;
      }
      // Permission not yet granted — try to re-request (requires page load user gesture later).
      // We cannot call requestPermission here without a gesture, so fall back for now.
      return false;
    } catch {
      return false;
    }
  }

  function stop() {
    worker?.postMessage({ type: 'stop' });
    worker?.terminate();
    worker = null;
    isReading.value = false;
    isLoading.value = false;
  }

  async function forgetDirectory() {
    stop();
    await clearHandle();
    await deleteIdbValue(IDB_KEYS.scanState);
    await deleteIdbValue(IDB_KEYS.pilotSession);
  }

  /**
   * Push the current set of per-character overview settings to the worker.
   * Call this whenever overviews change (upload / duplicate / reset).
   */
  function syncOverviews(overviews: Array<{ charName: string; content: string }>) {
    if (!worker) return;
    worker.postMessage({ type: 'setOverviews', overviews });
  }

  onUnmounted(stop);

  return {
    isReading,
    isLoading,
    running: isReading,
    error,
    pickDirectory,
    tryRestoreDirectory,
    forgetDirectory,
    stop,
    syncOverviews,
    onEntries,
  };
}
