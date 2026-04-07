/**
 * useLogReader.ts
 *
 * Composable that uses the HTML5 File System Access API to read EVE combat logs
 * from a user-selected directory, detect language, tail the current session log,
 * and emit parsed log entries every 2s.
 */

import { ref, onUnmounted } from 'vue';
import { parseLine, type LogEntry } from '../lib/logRegex';

type EntryCallback = (entries: LogEntry[]) => void;

// EVE combat log files start with this header (the app_name changes with language)
const SESSION_HEADER_EN = /^Gametime:/;
// File naming pattern: YYYYMMDD_HHMMSS.txt
const LOG_FILE_RE = /^\d{8}_\d{6}\.txt$/;

export function useLogReader() {
  const isReading  = ref(false);
  const error      = ref<string | null>(null);
  const dirHandle  = ref<FileSystemDirectoryHandle | null>(null);
  const logHandle  = ref<FileSystemFileHandle | null>(null);
  let bytesRead    = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let entryCallback: EntryCallback = () => {};

  /** Call before mounting to register the entry callback */
  function onEntries(cb: EntryCallback) {
    entryCallback = cb;
  }

  /** Open the EVE logs folder (prompts user) */
  async function pickDirectory() {
    if (!('showDirectoryPicker' in window)) {
      error.value = 'File System Access API is not supported in this browser. Please use Chrome or Edge.';
      return;
    }
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'read' });
      dirHandle.value = handle;
      error.value     = null;
      await startPolling();
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        error.value = `Failed to open directory: ${e.message}`;
      }
    }
  }

  async function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    bytesRead = 0;
    logHandle.value = null;
    isReading.value = true;

    // Initial read
    await tick();
    pollTimer = setInterval(tick, 2000);
  }

  /** Find the most recently modified .txt log file in the directory */
  async function findCurrentLog(dir: FileSystemDirectoryHandle): Promise<FileSystemFileHandle | null> {
    let newest: FileSystemFileHandle | null = null;
    let newestTime = 0;

    for await (const [name, entry] of (dir as any).entries()) {
      if (entry.kind !== 'file') continue;
      if (!LOG_FILE_RE.test(name)) continue;
      const file = await (entry as FileSystemFileHandle).getFile();
      if (file.lastModified > newestTime) {
        newestTime = file.lastModified;
        newest = entry as FileSystemFileHandle;
      }
    }
    return newest;
  }

  async function tick() {
    if (!dirHandle.value) return;

    try {
      // Refresh log handle if this is the start or a new session file appeared
      const currentHandle = await findCurrentLog(dirHandle.value);
      if (!currentHandle) return;

      if (logHandle.value !== currentHandle) {
        // New log file detected — reset bytes read
        logHandle.value = currentHandle;
        bytesRead = 0;
      }

      const file  = await logHandle.value.getFile();
      const total = file.size;

      if (total <= bytesRead) return; // no new content

      const slice = file.slice(bytesRead);
      const text  = await slice.text();
      bytesRead   = total;

      const lines   = text.split('\n');
      const entries: LogEntry[] = [];

      for (const line of lines) {
        const entry = parseLine(line);
        if (entry) entries.push(entry);
      }

      if (entries.length > 0) {
        entryCallback(entries);
      }
    } catch (e: any) {
      if (e.name !== 'NotFoundError') {
        error.value = `Read error: ${e.message}`;
      }
    }
  }

  function stop() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    isReading.value = false;
  }

  onUnmounted(stop);

  return { isReading, error, pickDirectory, stop, onEntries };
}
