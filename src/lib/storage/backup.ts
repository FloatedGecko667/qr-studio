// One-file backup of everything the app keeps on this device: settings, presets, templates,
// history and the scan log. Imported files are untrusted and pass through the same loaders
// and validators as data read from storage.

import { BARCODE_KEY, loadBarcodeSettings, MATRIX_KEY, storedBarcodeSettings } from '../barcode/settings';
import { validEntries, type ScanLogEntry } from '../scanLog';
import { normalizeScanPrefs, PREFS_KEY, scanLog } from '../scanLogState.svelte';
import { loadSettings, SETTINGS_KEY, storedSettings } from '../settings';
import { exportHistory, parseHistory } from './historyJson';
import { loadJson, saveJson } from './local';
import { addHistory, listHistory, listPresets, savePreset, type HistoryEntry, type Preset } from './records';
import { hasSecrets, importTemplates, listTemplates, secretKeys, type InputTemplate } from './templates';

export const BACKUP_FORMAT = 'qr-studio-backup';
export const BACKUP_VERSION = 1;
/** Backups larger than this are refused before parsing. */
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export interface BackupSummary {
  settings: number;
  presets: number;
  templates: number;
  history: number;
  scanLog: number;
}

export interface ParsedBackup {
  settings: { qr?: unknown; barcode?: unknown; matrix?: unknown; scanPrefs?: unknown };
  presets: Preset[];
  templates: unknown[];
  history: HistoryEntry[];
  scanLog: ScanLogEntry[];
  summary: BackupSummary;
}

/** What a backup would contain, to show before writing it (and to warn about passwords). */
export async function backupContents(): Promise<{ summary: BackupSummary; secrets: boolean }> {
  const [presets, templates, history] = await Promise.all([listPresets(), listTemplates(), listHistory()]);
  await scanLog.load();
  return {
    summary: { settings: 4, presets: presets.length, templates: templates.length, history: history.length, scanLog: scanLog.entries.length },
    secrets: hasSecrets(templates),
  };
}

function withoutSecrets(t: InputTemplate): InputTemplate {
  const fields = { ...t.fields };
  for (const k of secretKeys(t.kind)) if (k in fields) fields[k] = '';
  return { ...t, fields };
}

/** The backup file as JSON text. */
export async function createBackup(includeSecrets: boolean, now = new Date()): Promise<string> {
  const [presets, templates, history] = await Promise.all([listPresets(), listTemplates(), listHistory()]);
  await scanLog.load();
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    settings: {
      qr: loadJson(SETTINGS_KEY),
      barcode: loadJson(BARCODE_KEY),
      matrix: loadJson(MATRIX_KEY),
      scanPrefs: loadJson(PREFS_KEY),
    },
    presets,
    templates: includeSecrets ? templates : templates.map(withoutSecrets),
    // History may hold files (binary input); the history export encodes them as base64.
    history: JSON.parse(exportHistory(history)).items,
    scanLog: scanLog.entries,
  });
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isPrimitive = (v: unknown) => ['string', 'number', 'boolean'].includes(typeof v) || v === null;

function validPreset(v: unknown): Preset | null {
  if (!isRecord(v) || typeof v.id !== 'string' || typeof v.name !== 'string' || typeof v.createdAt !== 'number' || !isRecord(v.style)) return null;
  const style = Object.fromEntries(Object.entries(v.style).filter(([, x]) => isPrimitive(x)));
  const logo = typeof v.logoDataUrl === 'string' && v.logoDataUrl.startsWith('data:image/png;base64,') ? v.logoDataUrl : null;
  return { id: v.id.slice(0, 64), name: v.name.slice(0, 40), createdAt: v.createdAt, style, logoDataUrl: logo };
}

/** Validates a backup file; null when it is not one (or from a newer, unknown version). */
export function parseBackup(json: string): ParsedBackup | null {
  if (json.length > MAX_BACKUP_BYTES) return null;
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.format !== BACKUP_FORMAT || typeof data.version !== 'number' || data.version > BACKUP_VERSION) return null;
  const s = isRecord(data.settings) ? data.settings : {};
  const settings = {
    qr: isRecord(s.qr) ? s.qr : undefined,
    barcode: isRecord(s.barcode) ? s.barcode : undefined,
    matrix: isRecord(s.matrix) ? s.matrix : undefined,
    scanPrefs: isRecord(s.scanPrefs) ? s.scanPrefs : undefined,
  };
  const presets = (Array.isArray(data.presets) ? data.presets : []).map(validPreset).filter((p): p is Preset => !!p);
  const templates = Array.isArray(data.templates) ? data.templates : [];
  const history = parseHistory(JSON.stringify({ format: 'qr-studio-history', version: 1, items: Array.isArray(data.history) ? data.history : [] })) ?? [];
  const log = validEntries(data.scanLog);
  return {
    settings,
    presets,
    templates,
    history,
    scanLog: log,
    summary: {
      settings: Object.values(settings).filter(Boolean).length,
      presets: presets.length,
      templates: templates.length,
      history: history.length,
      scanLog: log.length,
    },
  };
}

/**
 * Restores a backup: settings are replaced (after normalising), presets, templates, history and
 * scan log rows are added by id. The caller reloads the page so the new settings take effect.
 */
export async function restoreBackup(b: ParsedBackup): Promise<BackupSummary> {
  if (b.settings.qr) saveJson(SETTINGS_KEY, storedSettings(loadSettings(b.settings.qr)));
  if (b.settings.barcode) saveJson(BARCODE_KEY, storedBarcodeSettings(loadBarcodeSettings(b.settings.barcode)));
  if (b.settings.matrix) saveJson(MATRIX_KEY, storedBarcodeSettings(loadBarcodeSettings(b.settings.matrix)));
  if (b.settings.scanPrefs) saveJson(PREFS_KEY, normalizeScanPrefs(b.settings.scanPrefs));

  const havePresets = new Set((await listPresets()).map((p) => p.id));
  let presets = 0;
  for (const p of b.presets) if (!havePresets.has(p.id) && (await savePreset(p))) presets++;

  const haveHistory = new Set((await listHistory()).map((h) => h.id));
  const newHistory = b.history.filter((h) => !haveHistory.has(h.id));
  // Oldest first, so the history limit drops the oldest entries overall.
  for (const h of [...newHistory].sort((x, y) => x.createdAt - y.createdAt)) await addHistory(h);

  return {
    settings: Object.values(b.settings).filter(Boolean).length,
    presets,
    templates: await importTemplates(b.templates),
    history: newHistory.length,
    scanLog: await scanLog.merge(b.scanLog),
  };
}
