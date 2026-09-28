import { createStore, del, entries, set } from 'idb-keyval';
import { PARTIAL_LIMIT, type PartialSequence } from '../scan';

// Incomplete structured-append reads survive a stopped camera, a reload or a closed app.

/** Saved reads older than this are dropped: they most likely belong to a finished task. */
export const PARTIAL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let store: ReturnType<typeof createStore> | null = null;
const ss = () => (store ??= createStore('qr-studio-scan', 'sequences'));

const isBytes = (v: unknown): v is Uint8Array => v instanceof Uint8Array;

/** Stored records are re-validated: anything malformed is dropped. */
function valid(v: unknown): v is PartialSequence {
  if (!v || typeof v !== 'object') return false;
  const s = v as PartialSequence;
  if (typeof s.sequenceId !== 'string' || typeof s.format !== 'string') return false;
  if (!Number.isInteger(s.total) || s.total < 2 || s.total > 16 || typeof s.updatedAt !== 'number') return false;
  if (s.key !== `${s.format}/${s.sequenceId}/${s.total}` || !Number.isInteger(s.last) || s.last < 0 || s.last >= s.total) return false;
  if (!s.parts || typeof s.parts !== 'object') return false;
  // Keys must be canonical integers ("1", not "01" or "1.0") so lookups by index find them.
  return Object.entries(s.parts).every(([k, b]) => String(Number(k)) === k && Number(k) >= 0 && Number(k) < s.total && isBytes(b));
}

/** Valid saved reads, newest first; invalid and expired records are deleted. */
export async function listPartials(): Promise<PartialSequence[]> {
  try {
    const all = await entries<string, unknown>(ss());
    const keep: PartialSequence[] = [];
    for (const [key, v] of all) {
      if (valid(v) && Date.now() - v.updatedAt < PARTIAL_MAX_AGE_MS) keep.push(v);
      else await del(key, ss());
    }
    return keep.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export { valid as isValidPartial };

/** Saves a sequence and trims the oldest ones beyond the limit. */
export async function savePartial(s: PartialSequence): Promise<void> {
  try {
    await set(s.key, plainCopy(s), ss());
    const all = await listPartials();
    for (const old of all.slice(PARTIAL_LIMIT)) await del(old.key, ss());
  } catch {
    // Storage can be unavailable (private mode); scanning still works in memory.
  }
}

export async function deletePartial(key: string): Promise<void> {
  try {
    await del(key, ss());
  } catch {
    // ignore
  }
}

/** Plain copy (structured clone rejects Svelte proxies). */
function plainCopy(s: PartialSequence): PartialSequence {
  return { ...s, parts: Object.fromEntries(Object.entries(s.parts).map(([k, b]) => [k, new Uint8Array(b)])) };
}
