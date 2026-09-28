import { createStore, del, entries, set, clear } from 'idb-keyval';

export const HISTORY_LIMIT = 100;
export const PRESET_LIMIT = 20;

export interface HistoryEntry {
  id: string;
  createdAt: number;
  kind: string;
  /** Form values for `kind`; binary files are stored as Uint8Array. */
  fields: Record<string, unknown>;
  symbol: Record<string, unknown>;
  style: Record<string, unknown>;
  logoDataUrl: string | null;
  summary: string;
}

export interface Preset {
  id: string;
  name: string;
  createdAt: number;
  style: Record<string, unknown>;
  logoDataUrl: string | null;
}

let historyStore: ReturnType<typeof createStore> | null = null;
let presetStore: ReturnType<typeof createStore> | null = null;
const hs = () => (historyStore ??= createStore('qr-studio-history', 'entries'));
const ps = () => (presetStore ??= createStore('qr-studio-presets', 'entries'));

export function newId(): string {
  return crypto.randomUUID();
}

async function list<T extends { createdAt: number }>(store: ReturnType<typeof createStore>): Promise<T[]> {
  try {
    const all = await entries<string, T>(store);
    return all.map(([, v]) => v).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export const listHistory = () => list<HistoryEntry>(hs());
export const listPresets = () => list<Preset>(ps());

/** Adds an entry and trims the oldest ones beyond the limit. */
export async function addHistory(entry: HistoryEntry): Promise<void> {
  await set(entry.id, entry, hs());
  const all = await listHistory();
  for (const old of all.slice(HISTORY_LIMIT)) await del(old.id, hs());
}

export const deleteHistory = (id: string) => del(id, hs());
export const clearHistory = () => clear(hs());

export async function savePreset(preset: Preset): Promise<boolean> {
  const all = await listPresets();
  if (all.length >= PRESET_LIMIT && !all.some((p) => p.id === preset.id)) return false;
  await set(preset.id, preset, ps());
  return true;
}

export const deletePreset = (id: string) => del(id, ps());
