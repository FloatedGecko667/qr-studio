import { createStore, get, set } from 'idb-keyval';
import { addRead, SCAN_LOG_LIMIT, validEntries, type AddResult, type ScanLogEntry, type ScanLogMode } from './scanLog';
import { loadJson, saveJson } from './storage/local';
import { newId } from './storage/records';

export const PREFS_KEY = 'qr-studio-scan-prefs';
/** Longer payloads (e.g. images) are cut so the log stays small; the scan result keeps the full text. */
const MAX_TEXT = 10_000;

export interface ScanPrefs {
  /** Keep the camera running after a read. */
  continuous: boolean;
  mode: ScanLogMode;
  /** Beep on each new read (vibration is always used where available). */
  beep: boolean;
  /** Camera chosen by the user ('' = the rear camera by default). */
  deviceId: string;
}

/** Stored or imported preferences are untrusted: unknown values fall back to the defaults. */
export function normalizeScanPrefs(stored: unknown): ScanPrefs {
  const p = (stored && typeof stored === 'object' ? stored : {}) as Partial<ScanPrefs>;
  return {
    continuous: p.continuous === true,
    mode: p.mode === 'count' ? 'count' : 'each',
    beep: p.beep === true,
    deviceId: typeof p.deviceId === 'string' && p.deviceId.length <= 512 ? p.deviceId : '',
  };
}

let store: ReturnType<typeof createStore> | null = null;
const ls = () => (store ??= createStore('qr-studio-scanlog', 'log'));

/** Every completed read, kept in IndexedDB across sessions. */
class ScanLogState {
  entries: ScanLogEntry[] = $state.raw([]);
  prefs: ScanPrefs = $state(normalizeScanPrefs(loadJson(PREFS_KEY)));
  #loaded: Promise<void> | null = null;
  #audio: AudioContext | null = null;

  load(): Promise<void> {
    return (this.#loaded ??= get<unknown>('entries', ls())
      .then((v) => {
        // Reads made before loading finished stay on top.
        this.entries = [...this.entries, ...validEntries(v)];
      })
      .catch(() => undefined));
  }

  setPrefs(patch: Partial<ScanPrefs>): void {
    this.prefs = { ...this.prefs, ...patch };
    saveJson(PREFS_KEY, this.prefs);
  }

  record(read: { text: string; format: string }): AddResult {
    const { log, result } = addRead(this.entries, { text: read.text.slice(0, MAX_TEXT), format: read.format }, this.prefs.mode, Date.now(), newId);
    this.entries = log;
    if (result !== 'repeat') {
      this.#save();
      this.#notify();
    }
    return result;
  }

  /** Adds rows from a backup; rows already in the log (same id) are kept as they are. */
  async merge(rows: readonly ScanLogEntry[]): Promise<number> {
    await this.load();
    const have = new Set(this.entries.map((e) => e.id));
    const added = rows.filter((r) => !have.has(r.id));
    this.entries = [...this.entries, ...added].sort((a, b) => b.lastAt - a.lastAt).slice(0, SCAN_LOG_LIMIT);
    this.#save();
    return added.length;
  }

  remove(id: string): void {
    this.entries = this.entries.filter((e) => e.id !== id);
    this.#save();
  }

  async clear(): Promise<void> {
    await this.load();
    this.entries = [];
    this.#save();
  }

  /** Call from a tap (e.g. starting the camera): browsers only allow audio after a gesture. */
  unlockAudio(): void {
    if (!this.prefs.beep || this.#audio) return;
    try {
      this.#audio = new AudioContext();
    } catch {
      this.#audio = null;
    }
  }

  #notify(): void {
    navigator.vibrate?.(60);
    const ctx = this.#audio;
    if (!this.prefs.beep || !ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1200;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  }

  /** Waits for the stored log to be merged in first, so an early save cannot overwrite it. */
  #save(): void {
    void this.load()
      .then(() => set('entries', $state.snapshot(this.entries), ls()))
      .catch(() => {
        // Storage can be unavailable (private mode); the log still works for this session.
      });
  }
}

export const scanLog = new ScanLogState();
