/**
 * logReader.worker.ts
 *
 * Web Worker that polls a FileSystemDirectoryHandle for EVE combat log files,
 * reads new bytes from each file every 2 s, and posts parsed LogEntry batches
 * back to the main thread.
 *
 * Messages received from main thread:
 *   { type: 'start',       handle: FileSystemDirectoryHandle }
 *   { type: 'setOverviews', overviews: Array<{ charName: string; content: string }> }
 *   { type: 'stop' }
 *
 * Messages posted to main thread:
 *   { type: 'entries',        entries: LogEntry[] }
 *   { type: 'overviewLoaded', count: number }
 *   { type: 'error',          message: string }
 */

import { parseLine, parseHeader, buildOverviewRegex, DEFAULT_PILOT_WEAPON_RE, type LogEntry } from '../lib/logRegex';
import { load as yamlLoad } from 'js-yaml';
import type { LogReaderScanState } from '../lib/logCache';

const LOG_FILE_RE = /^\d{8}_\d{6}_\d+\.txt$/;
const LOG_POLL_MS = parseInt(import.meta.env.VITE_LOG_POLL_MS ?? '2000', 10);

let dirHandle: FileSystemDirectoryHandle | null = null;
const fileOffsets = new Map<string, number>();
const fileChars   = new Map<string, string>(); // filename → character name
const fileLangs   = new Map<string, string>(); // filename → language
const fileSizes   = new Map<string, number>(); // filename → last known size
let pollTimer: ReturnType<typeof setInterval> | null = null;
/** Per-character-name override regex built from their overview YAML */
const perCharRe   = new Map<string, RegExp>();
/** Fallback regex when a character has no overview loaded */
const fallbackRe: RegExp = DEFAULT_PILOT_WEAPON_RE;

async function findAllLogs(dir: FileSystemDirectoryHandle): Promise<Array<[string, FileSystemFileHandle]>> {
  const results: Array<[string, FileSystemFileHandle]> = [];
  for await (const [name, entry] of (dir as any).entries()) {
    if (entry.kind !== 'file') continue;
    if (!LOG_FILE_RE.test(name)) continue;
    results.push([name, entry as FileSystemFileHandle]);
  }
  return results;
}

async function tick() {
  if (!dirHandle) return;

  try {
    const allLogs = await findAllLogs(dirHandle);
    if (!allLogs.length) return;

    const seenNames = new Set(allLogs.map(([name]) => name));
    for (const name of [...fileOffsets.keys()]) {
      if (seenNames.has(name)) continue;
      fileOffsets.delete(name);
      fileChars.delete(name);
      fileLangs.delete(name);
      fileSizes.delete(name);
    }

    const allEntries: LogEntry[] = [];

    for (const [name, handle] of allLogs) {
      const file   = await handle.getFile();
      const total  = file.size;
      let offset = fileOffsets.get(name) ?? 0;

      if (total < offset) {
        offset = 0;
        fileOffsets.set(name, 0);
        fileChars.delete(name);
        fileLangs.delete(name);
      }

      // First read of this file: parse the header to get character + language.
      if (offset === 0 && !fileChars.has(name)) {
        const headerText = await file.slice(0, Math.min(512, total)).text();
        const header = parseHeader(headerText);
        fileChars.set(name, header?.characterName ?? '');
        fileLangs.set(name, header?.language ?? 'english');
      }

      fileSizes.set(name, total);

      if (total <= offset) continue;

      const text = await file.slice(offset).text();
      fileOffsets.set(name, total);
      fileSizes.set(name, total);

      const charName = fileChars.get(name) ?? '';
      const lang     = fileLangs.get(name) ?? 'english';
      const re       = perCharRe.get(charName) ?? fallbackRe;

      for (const line of text.split('\n')) {
        const entry = parseLine(line, charName, lang, re);
        if (entry) allEntries.push(entry);
      }
    }

    if (allEntries.length > 0) {
      self.postMessage({ type: 'entries', entries: allEntries });
    }
    self.postMessage({ type: 'scanState', state: buildScanState() });
  } catch (e: any) {
    if (e.name !== 'NotFoundError') {
      self.postMessage({ type: 'error', message: `Read error: ${e.message}` });
    }
  }
}

function buildScanState(): LogReaderScanState {
  const state: LogReaderScanState = {};
  for (const [name, offset] of fileOffsets) {
    state[name] = {
      offset,
      size: fileSizes.get(name) ?? offset,
      characterName: fileChars.get(name) ?? '',
      language: fileLangs.get(name) ?? 'english',
    };
  }
  return state;
}

function restoreScanState(state: LogReaderScanState | undefined) {
  fileOffsets.clear();
  fileChars.clear();
  fileLangs.clear();
  fileSizes.clear();
  if (!state) return;
  for (const [name, entry] of Object.entries(state)) {
    fileOffsets.set(name, entry.offset);
    fileChars.set(name, entry.characterName);
    fileLangs.set(name, entry.language);
    fileSizes.set(name, entry.size);
  }
}

function stop() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  dirHandle = null;
  fileOffsets.clear();
  fileChars.clear();
  fileLangs.clear();
  fileSizes.clear();
  // Preserve perCharRe across stop/start so re-opening the log dir keeps overviews
}

self.addEventListener('message', async (evt: MessageEvent) => {
  const msg = evt.data as {
    type: string;
    handle?: FileSystemDirectoryHandle;
    scanState?: LogReaderScanState;
    overviews?: Array<{ charName: string; content: string }>;
  };

  if (msg.type === 'start' && msg.handle) {
    stop();
    dirHandle = msg.handle;
    restoreScanState(msg.scanState);
    self.postMessage({ type: 'loading' });
    await tick();
    self.postMessage({ type: 'ready' });
    pollTimer = setInterval(tick, LOG_POLL_MS);

  } else if (msg.type === 'setOverviews' && Array.isArray(msg.overviews)) {
    perCharRe.clear();
    let ok = 0;
    for (const { charName, content } of msg.overviews) {
      try {
        const parsed = yamlLoad(content) as any;
        if (parsed?.shipLabelOrder && Array.isArray(parsed?.shipLabels)) {
          const re = buildOverviewRegex(parsed);
          if (re) {
            perCharRe.set(charName.trim(), re);
            ok++;
          }
        }
      } catch {
        // skip malformed entries — will fall back to default regex
      }
    }
    self.postMessage({ type: 'overviewLoaded', count: ok });

  } else if (msg.type === 'stop') {
    stop();
  }
});

