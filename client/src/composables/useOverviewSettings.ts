/**
 * useOverviewSettings.ts
 *
 * Manages per-character EVE overview settings files.
 * Settings are persisted in localStorage so they survive page reloads.
 *
 * Each character can have its own overview YAML uploaded; settings can also be
 * duplicated from one character to another, or reset (cleared) individually.
 */

import { ref } from 'vue';

const STORAGE_KEY = 'peld-overview-settings';

export interface CharOverview {
  charId:     number;
  charName:   string;
  /** Raw YAML text from the EVE overview settings file */
  content:    string;
  filename:   string;
  uploadedAt: string;
}

function loadFromStorage(): Record<number, CharOverview> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<number, CharOverview>) : {};
  } catch {
    return {};
  }
}

function saveToStorage(data: Record<number, CharOverview>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage quota exceeded — silently ignore
  }
}

// Shared reactive state across all composable instances
const overviews = ref<Record<number, CharOverview>>(loadFromStorage());

export function useOverviewSettings() {
  /** Get the stored overview for a character, or null if none has been loaded. */
  function get(charId: number): CharOverview | null {
    return overviews.value[charId] ?? null;
  }

  /**
   * Open a file picker so the user can choose an EVE overview YAML for a character.
   * Returns true if a file was selected, false if the picker was cancelled.
   * Throws on any other error.
   */
  async function upload(charId: number, charName: string): Promise<boolean> {
    if (!('showOpenFilePicker' in window)) {
      throw new Error('File picker not supported in this browser (use Chrome or Edge).');
    }
    try {
      const [fileHandle] = await (window as any).showOpenFilePicker({
        types: [
          {
            description: 'EVE Overview Settings',
            accept: { 'text/yaml': ['.yaml', '.yml'] },
          },
        ],
        multiple: false,
      });
      const file    = await fileHandle.getFile();
      const content = await file.text();

      overviews.value = {
        ...overviews.value,
        [charId]: {
          charId,
          charName,
          content,
          filename:   file.name,
          uploadedAt: new Date().toISOString(),
        } satisfies CharOverview,
      };
      saveToStorage(overviews.value);
      return true;
    } catch (e: any) {
      if (e.name === 'AbortError') return false;
      throw e;
    }
  }

  /**
   * Copy the overview from one character to another.
   * No-op if the source character has no overview loaded.
   */
  function duplicate(fromCharId: number, toCharId: number, toCharName: string): boolean {
    const src = overviews.value[fromCharId];
    if (!src) return false;

    overviews.value = {
      ...overviews.value,
      [toCharId]: {
        ...src,
        charId:     toCharId,
        charName:   toCharName,
        uploadedAt: new Date().toISOString(),
      },
    };
    saveToStorage(overviews.value);
    return true;
  }

  /** Remove the stored overview for a character. */
  function reset(charId: number) {
    if (!(charId in overviews.value)) return;
    const next = { ...overviews.value };
    delete next[charId];
    overviews.value = next;
    saveToStorage(overviews.value);
  }

  /**
   * Returns all current overviews as a flat array suitable for sending to the
   * log-reader worker, keyed by character name (which is what the worker uses
   * when reading log file headers).
   */
  function getAll(): Array<{ charName: string; content: string }> {
    return Object.values(overviews.value).map(o => ({
      charName: o.charName,
      content:  o.content,
    }));
  }

  return { overviews, get, upload, duplicate, reset, getAll };
}
