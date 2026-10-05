// Batch generation from CSV columns: each row fills one input form (Wi-Fi, contact, event, ...).

import { sanitizeFilename } from './export/download';
import type { BatchItem } from './batch';
import type { PayloadKind } from './payload';
import { FORMS, type FieldDef, type FormValues } from './payload/forms';

export const MAPPABLE_KINDS = ['url', 'tel', 'sms', 'email', 'wifi', 'vcard', 'mecard', 'geo', 'event', 'gs1', 'gs1dl'] as const;
export type MappableKind = (typeof MAPPABLE_KINDS)[number];

/** Field key → column index (-1: not used; the form's default applies). */
export type ColumnMapping = Record<string, number>;

/** Fields that can come from a CSV column (not files). */
export function mappableFields(kind: MappableKind): readonly FieldDef[] {
  return FORMS[kind].fields.filter((f) => f.type !== 'file');
}

/** Header names that usually mean a field, besides its key and on-screen label. */
const ALIASES: Record<string, readonly string[]> = {
  url: ['link', 'リンク', 'website', 'web', 'ウェブサイト', 'ホームページ'],
  utm_source: ['source'],
  utm_medium: ['medium'],
  utm_campaign: ['campaign'],
  utm_term: ['term'],
  utm_content: ['content'],
  tel: ['phone', 'telephone', 'mobile', 'number', '電話', '電話番号', '携帯', '携帯電話'],
  message: ['body', 'text', 'メッセージ', '本文'],
  to: ['email', 'mail', 'address', '宛先', 'メール', 'メールアドレス'],
  subject: ['title', '件名'],
  body: ['message', 'text', '本文'],
  ssid: ['network', 'networkname', 'wifi', 'ネットワーク', 'ネットワーク名'],
  auth: ['security', 'encryption', 'type', '暗号化', 'セキュリティ', '認証'],
  password: ['pass', 'pw', 'key', 'パスワード', 'パス'],
  hidden: ['ステルス', '非公開'],
  lastName: ['lastname', 'last', 'familyname', 'surname', '姓', '名字', '苗字'],
  firstName: ['firstname', 'first', 'givenname', '名', '名前'],
  org: ['organization', 'organisation', 'company', '会社', '会社名', '組織', '所属'],
  title: ['jobtitle', 'position', 'role', '役職', '肩書き'],
  email: ['mail', 'emailaddress', 'メール', 'メールアドレス'],
  address: ['住所', '所在地'],
  note: ['memo', 'notes', 'comment', 'メモ', '備考'],
  lat: ['latitude', '緯度'],
  lng: ['lon', 'long', 'longitude', '経度'],
  label: ['name', 'place', 'placename', '名称', '場所名'],
  summary: ['title', 'event', 'name', 'タイトル', '件名', '予定', 'イベント'],
  allDay: ['allday', '終日'],
  start: ['begin', 'startdate', 'from', '開始', '開始日時', '開始日'],
  end: ['finish', 'enddate', 'until', '終了', '終了日時', '終了日'],
  timeZone: ['timezone', 'tz', 'zone', 'タイムゾーン'],
  location: ['place', 'venue', '場所', '会場'],
  description: ['desc', 'details', 'detail', '説明', '詳細', '内容'],
  value: ['gs1', 'data', 'ai', 'elementstring', 'データ'],
  domain: ['resolver', 'ドメイン'],
  format: ['形式'],
};

const FILENAME_NAMES = ['filename', 'file', 'name', 'ファイル名', 'ファイル'];

/** Lower case, NFKC, without spaces, "_" and "-", for comparing header names. */
export const normalizeHeader = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s_\-()（）]/g, '');

/**
 * Picks a column for each field from the header row: the field key, its label in the current
 * language (`labelOf`), then common aliases. A column is used at most once.
 */
export function guessMapping(kind: MappableKind, header: readonly string[], labelOf: (f: FieldDef) => string = () => ''): ColumnMapping {
  const names = header.map(normalizeHeader);
  const used = new Set<number>();
  const mapping: ColumnMapping = {};
  const fields = mappableFields(kind);
  const find = (candidates: readonly string[]) => {
    for (const c of candidates.map(normalizeHeader)) {
      const i = names.findIndex((n, j) => n !== '' && n === c && !used.has(j));
      if (i >= 0) return i;
    }
    return -1;
  };
  // Exact keys and labels first, so that an alias never takes another field's own column.
  for (const f of fields) {
    const i = find([f.key, labelOf(f)].filter(Boolean));
    mapping[f.key] = i;
    if (i >= 0) used.add(i);
  }
  for (const f of fields) {
    if (mapping[f.key] >= 0) continue;
    const i = find(ALIASES[f.key] ?? []);
    mapping[f.key] = i;
    if (i >= 0) used.add(i);
  }
  return mapping;
}

export function guessFilenameColumn(header: readonly string[], mapping: ColumnMapping): number {
  const taken = new Set(Object.values(mapping));
  const names = header.map(normalizeHeader);
  for (const c of FILENAME_NAMES) {
    const i = names.findIndex((n, j) => n === normalizeHeader(c) && !taken.has(j));
    if (i >= 0) return i;
  }
  return -1;
}

const TRUE_WORDS = new Set(['1', 'true', 'yes', 'y', 'on', 'x', '✓', '○', '◯', 'はい', 'あり']);

const SELECT_SYNONYMS: Record<string, Record<string, string>> = {
  auth: { wpa2: 'WPA', 'wpa/wpa2': 'WPA', 'wpa/wpa2/wpa3': 'WPA', wpa3: 'SAE', none: 'nopass', open: 'nopass', なし: 'nopass', '': 'WPA' },
  timeZone: { jst: 'Asia/Tokyo', japan: 'Asia/Tokyo', 日本: 'Asia/Tokyo', z: 'UTC', gmt: 'UTC', なし: 'floating', none: 'floating' },
};

/** 2026/10/6 9:30, 2026-10-06T09:30 → the date input format (YYYY-MM-DD or YYYY-MM-DDTHH:mm). */
export function normalizeDateTime(value: string): string {
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::\d{2})?)?$/.exec(value.normalize('NFKC').trim());
  if (!m) return value.trim();
  const p = (v: string) => v.padStart(2, '0');
  const date = `${m[1]}-${p(m[2])}-${p(m[3])}`;
  return m[4] ? `${date}T${p(m[4])}:${m[5]}` : date;
}

function cellValue(f: FieldDef, raw: string, fallback: FormValues[string]): FormValues[string] {
  if (f.type === 'checkbox') return TRUE_WORDS.has(raw.normalize('NFKC').trim().toLowerCase());
  if (f.type === 'select') {
    const v = raw.trim();
    const low = v.toLowerCase();
    const option = f.options?.find((o) => o.value.toLowerCase() === low || o.label.toLowerCase() === low);
    if (option) return option.value;
    return SELECT_SYNONYMS[f.key]?.[low] ?? fallback;
  }
  if (f.type === 'datetime') return normalizeDateTime(raw);
  return raw;
}

/** Form values for one CSV row: mapped columns over the form's defaults. */
export function rowFields(kind: MappableKind, row: readonly string[], mapping: ColumnMapping): FormValues {
  const form = FORMS[kind];
  const out: FormValues = { ...form.defaults };
  for (const f of mappableFields(kind)) {
    const i = mapping[f.key] ?? -1;
    if (i < 0) continue;
    out[f.key] = cellValue(f, row[i] ?? '', form.defaults[f.key]);
  }
  return out;
}

/** Batch items from data rows (the header excluded); empty rows are skipped. */
export function itemsFromMapping(
  rows: readonly (readonly string[])[],
  kind: MappableKind,
  mapping: ColumnMapping,
  filenameColumn: number,
  prefix = 'qr',
): BatchItem[] {
  const items: BatchItem[] = [];
  rows.forEach((row, i) => {
    if (row.every((c) => c.trim() === '')) return;
    const fallback = `${prefix}-${String(items.length + 1).padStart(4, '0')}`;
    const name = filenameColumn >= 0 ? (row[filenameColumn] ?? '').trim() : '';
    items.push({ row: i + 2, content: '', filename: sanitizeFilename(name, fallback), kind: kind as PayloadKind, fields: rowFields(kind, row, mapping) });
  });
  return items;
}
