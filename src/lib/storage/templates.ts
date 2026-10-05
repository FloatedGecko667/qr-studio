import { createStore, del, entries, set } from 'idb-keyval';
import type { PayloadKind } from '../payload';
import { FORMS, restoreFields, type FormValues } from '../payload/forms';
import { newId } from './records';

// Input templates are the one place input content is stored, and only when the user saves one.

export const TEMPLATE_LIMIT = 50;
export const TEMPLATE_NAME_MAX = 40;
/** Large or file-based inputs are not offered as templates. */
export const TEMPLATE_KINDS_EXCLUDED: ReadonlySet<PayloadKind> = new Set(['image', 'binary']);

export interface InputTemplate {
  id: string;
  name: string;
  kind: PayloadKind;
  fields: FormValues;
  createdAt: number;
}

let store: ReturnType<typeof createStore> | null = null;
const ts = () => (store ??= createStore('qr-studio-templates', 'templates'));

/** Keys of password fields for a kind (e.g. the Wi-Fi password). */
export function secretKeys(kind: PayloadKind): string[] {
  return FORMS[kind].fields.filter((f) => f.type === 'password').map((f) => f.key);
}

/** Fields to store: files are never kept, passwords only when asked for. */
export function templateFields(kind: PayloadKind, values: FormValues, includeSecrets: boolean): FormValues {
  const secrets = new Set(secretKeys(kind));
  const out: FormValues = {};
  for (const [k, v] of Object.entries(restoreFields(kind, values))) {
    if (v instanceof Uint8Array || v === null) continue;
    out[k] = secrets.has(k) && !includeSecrets ? '' : v;
  }
  return out;
}

/** Stored records are untrusted: fields pass through the form defaults and types again. */
function valid(v: unknown): InputTemplate | null {
  if (!v || typeof v !== 'object') return null;
  const t = v as Partial<InputTemplate>;
  if (typeof t.id !== 'string' || typeof t.name !== 'string' || typeof t.createdAt !== 'number') return null;
  if (typeof t.kind !== 'string' || !(t.kind in FORMS) || TEMPLATE_KINDS_EXCLUDED.has(t.kind as PayloadKind)) return null;
  if (!t.fields || typeof t.fields !== 'object') return null;
  const kind = t.kind as PayloadKind;
  return { id: t.id, name: t.name.slice(0, TEMPLATE_NAME_MAX), kind, fields: templateFields(kind, t.fields as FormValues, true), createdAt: t.createdAt };
}

/** Valid templates, newest first; malformed records are deleted. */
export async function listTemplates(): Promise<InputTemplate[]> {
  try {
    const out: InputTemplate[] = [];
    for (const [key, v] of await entries<string, unknown>(ts())) {
      const t = valid(v);
      if (t) out.push(t);
      else await del(key, ts());
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function saveTemplate(name: string, kind: PayloadKind, values: FormValues, includeSecrets: boolean): Promise<InputTemplate> {
  const t: InputTemplate = {
    id: newId(),
    name: name.trim().slice(0, TEMPLATE_NAME_MAX),
    kind,
    fields: templateFields(kind, values, includeSecrets),
    createdAt: Date.now(),
  };
  const existing = await listTemplates();
  if (existing.length >= TEMPLATE_LIMIT) throw new RangeError('template-limit');
  await set(t.id, t, ts());
  return t;
}

/** Adds templates from a backup (validated again); existing ids are skipped, the limit applies. */
export async function importTemplates(items: readonly unknown[]): Promise<number> {
  const existing = await listTemplates();
  const have = new Set(existing.map((t) => t.id));
  let count = existing.length;
  let added = 0;
  for (const item of items) {
    const t = valid(item);
    if (!t || have.has(t.id) || count >= TEMPLATE_LIMIT) continue;
    await set(t.id, t, ts());
    have.add(t.id);
    count++;
    added++;
  }
  return added;
}

/** True when any template keeps a password. */
export function hasSecrets(list: readonly InputTemplate[]): boolean {
  return list.some((t) => secretKeys(t.kind).some((k) => typeof t.fields[k] === 'string' && t.fields[k] !== ''));
}

export async function deleteTemplate(id: string): Promise<void> {
  try {
    await del(id, ts());
  } catch {
    // ignore
  }
}
