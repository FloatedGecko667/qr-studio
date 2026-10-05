import {
  buildBinary,
  buildEmail,
  buildEvent,
  buildGeo,
  buildGs1,
  buildGs1DigitalLink,
  buildMecard,
  buildMultiUrl,
  buildSms,
  buildTel,
  buildText,
  buildUrl,
  buildVcard,
  buildWifi,
  type ContactFields,
  type Payload,
  type PayloadKind,
  type EventTimeZone,
  type UtmKey,
  UTM_KEYS,
  type WifiAuth,
} from '.';
import { encodeImage } from '../imageData';

export type FieldType = 'text' | 'textarea' | 'url' | 'tel' | 'email' | 'password' | 'number' | 'datetime' | 'select' | 'checkbox' | 'file';

export interface FieldDef {
  key: string;
  type: FieldType;
  /** i18n key suffix under `field.` */
  label: string;
  options?: readonly { value: string; label: string }[];
  placeholder?: string;
  rows?: number;
  showIf?: (f: FormValues) => boolean;
  /** Fields sharing a group are shown together in a collapsible section (i18n key `group.<name>`). */
  group?: string;
}

export type FormValues = Record<string, string | boolean | Uint8Array | null>;

export interface FormDef {
  fields: readonly FieldDef[];
  defaults: FormValues;
  build: (f: FormValues) => Payload;
}

const s = (f: FormValues, k: string) => (typeof f[k] === 'string' ? (f[k] as string) : '');
const b = (f: FormValues, k: string) => f[k] === true;

const UTM_PLACEHOLDERS: Record<UtmKey, string> = {
  source: 'flyer',
  medium: 'qr',
  campaign: 'autumn_sale',
  term: '',
  content: 'front',
};

const CONTACT_FIELDS: FieldDef[] = [
  { key: 'lastName', type: 'text', label: 'lastName' },
  { key: 'firstName', type: 'text', label: 'firstName' },
  { key: 'org', type: 'text', label: 'org' },
  { key: 'title', type: 'text', label: 'jobTitle' },
  { key: 'tel', type: 'tel', label: 'tel' },
  { key: 'email', type: 'email', label: 'email' },
  { key: 'url', type: 'url', label: 'url' },
  { key: 'address', type: 'text', label: 'address' },
  { key: 'note', type: 'textarea', label: 'note', rows: 2 },
];
const CONTACT_DEFAULTS: FormValues = Object.fromEntries(CONTACT_FIELDS.map((f) => [f.key, '']));
export const contactFields = (f: FormValues): ContactFields => ({
  lastName: s(f, 'lastName'),
  firstName: s(f, 'firstName'),
  org: s(f, 'org'),
  title: s(f, 'title'),
  tel: s(f, 'tel'),
  email: s(f, 'email'),
  url: s(f, 'url'),
  address: s(f, 'address'),
  note: s(f, 'note'),
});

export const FORMS: Record<PayloadKind, FormDef> = {
  url: {
    fields: [
      { key: 'url', type: 'url', label: 'url', placeholder: 'https://example.com' },
      ...UTM_KEYS.map((k): FieldDef => ({ key: `utm_${k}`, type: 'text', label: `utm_${k}`, group: 'utm', placeholder: UTM_PLACEHOLDERS[k] })),
    ],
    defaults: { url: 'https://example.com', ...Object.fromEntries(UTM_KEYS.map((k) => [`utm_${k}`, ''])) },
    build: (f) => buildUrl({ url: s(f, 'url'), utm: Object.fromEntries(UTM_KEYS.map((k) => [k, s(f, `utm_${k}`)])) }),
  },
  text: {
    fields: [{ key: 'text', type: 'textarea', label: 'text', rows: 5 }],
    defaults: { text: '' },
    build: (f) => buildText({ text: s(f, 'text') }),
  },
  multiUrl: {
    fields: [{ key: 'urls', type: 'textarea', label: 'urls', rows: 5, placeholder: 'https://a.example\nhttps://b.example' }],
    defaults: { urls: '' },
    build: (f) => buildMultiUrl({ urls: s(f, 'urls') }),
  },
  tel: {
    fields: [{ key: 'tel', type: 'tel', label: 'tel', placeholder: '+81-3-1234-5678' }],
    defaults: { tel: '' },
    build: (f) => buildTel({ tel: s(f, 'tel') }),
  },
  sms: {
    fields: [
      { key: 'tel', type: 'tel', label: 'tel' },
      { key: 'message', type: 'textarea', label: 'message', rows: 3 },
    ],
    defaults: { tel: '', message: '' },
    build: (f) => buildSms({ tel: s(f, 'tel'), message: s(f, 'message') }),
  },
  email: {
    fields: [
      { key: 'to', type: 'email', label: 'to' },
      { key: 'subject', type: 'text', label: 'subject' },
      { key: 'body', type: 'textarea', label: 'body', rows: 3 },
      {
        key: 'format',
        type: 'select',
        label: 'emailFormat',
        options: [
          { value: 'mailto', label: 'mailto' },
          { value: 'matmsg', label: 'MATMSG' },
        ],
      },
    ],
    defaults: { to: '', subject: '', body: '', format: 'mailto' },
    build: (f) =>
      buildEmail({ to: s(f, 'to'), subject: s(f, 'subject'), body: s(f, 'body'), format: s(f, 'format') === 'matmsg' ? 'matmsg' : 'mailto' }),
  },
  wifi: {
    fields: [
      { key: 'ssid', type: 'text', label: 'ssid' },
      {
        key: 'auth',
        type: 'select',
        label: 'auth',
        options: [
          { value: 'WPA', label: 'WPA/WPA2/WPA3' },
          { value: 'SAE', label: 'option.wpa3Only' },
          { value: 'WEP', label: 'WEP' },
          { value: 'nopass', label: 'option.none' },
        ],
      },
      { key: 'password', type: 'password', label: 'password', showIf: (f) => f.auth !== 'nopass' },
      { key: 'hidden', type: 'checkbox', label: 'hidden' },
    ],
    defaults: { ssid: '', auth: 'WPA', password: '', hidden: false },
    build: (f) =>
      buildWifi({ ssid: s(f, 'ssid'), password: s(f, 'password'), auth: (s(f, 'auth') || 'WPA') as WifiAuth, hidden: b(f, 'hidden') }),
  },
  vcard: { fields: CONTACT_FIELDS, defaults: CONTACT_DEFAULTS, build: (f) => buildVcard(contactFields(f)) },
  mecard: { fields: CONTACT_FIELDS, defaults: CONTACT_DEFAULTS, build: (f) => buildMecard(contactFields(f)) },
  geo: {
    fields: [
      { key: 'lat', type: 'number', label: 'lat', placeholder: '35.6812' },
      { key: 'lng', type: 'number', label: 'lng', placeholder: '139.7671' },
      { key: 'label', type: 'text', label: 'placeLabel' },
    ],
    defaults: { lat: '', lng: '', label: '' },
    build: (f) => buildGeo({ lat: s(f, 'lat'), lng: s(f, 'lng'), label: s(f, 'label') }),
  },
  event: {
    fields: [
      { key: 'summary', type: 'text', label: 'summary' },
      { key: 'allDay', type: 'checkbox', label: 'allDay' },
      { key: 'start', type: 'datetime', label: 'start' },
      { key: 'end', type: 'datetime', label: 'end' },
      {
        key: 'timeZone',
        type: 'select',
        label: 'timeZone',
        options: [
          { value: 'floating', label: 'option.tzFloating' },
          { value: 'local', label: 'option.tzLocal' },
          { value: 'Asia/Tokyo', label: 'option.tzTokyo' },
          { value: 'UTC', label: 'UTC' },
        ],
        showIf: (f) => !f.allDay,
      },
      { key: 'location', type: 'text', label: 'location' },
      { key: 'description', type: 'textarea', label: 'description', rows: 2 },
    ],
    defaults: { summary: '', allDay: false, start: '', end: '', timeZone: 'floating', location: '', description: '' },
    build: (f) =>
      buildEvent({
        summary: s(f, 'summary'),
        start: s(f, 'start'),
        end: s(f, 'end'),
        allDay: b(f, 'allDay'),
        timeZone: (s(f, 'timeZone') || 'floating') as EventTimeZone,
        location: s(f, 'location'),
        description: s(f, 'description'),
      }),
  },
  gs1: {
    fields: [{ key: 'value', type: 'textarea', label: 'gs1', rows: 2, placeholder: '(01)04912345123459(10)ABC123' }],
    defaults: { value: '' },
    build: (f) => buildGs1({ value: s(f, 'value') }),
  },
  gs1dl: {
    fields: [
      { key: 'value', type: 'textarea', label: 'gs1', rows: 2, placeholder: '(01)04912345123459(10)ABC123(17)271231' },
      { key: 'domain', type: 'url', label: 'gs1dlDomain', placeholder: 'https://id.gs1.org' },
    ],
    defaults: { value: '', domain: 'https://id.gs1.org' },
    build: (f) => buildGs1DigitalLink({ value: s(f, 'value'), domain: s(f, 'domain') }),
  },
  image: {
    // Rendered by ImageInput.svelte: resizing is asynchronous, so the fitted file is stored here.
    fields: [],
    defaults: { image: null, mime: '', encoding: 'binary', format: 'webp', maxEdge: '256', maxQuality: '0.8' },
    build: (f) => {
      if (!(f.image instanceof Uint8Array)) return { errors: ['payload.image.required'], warnings: [] };
      const encoding = (['binary', 'base64', 'base45'] as const).find((e) => e === f.encoding) ?? 'binary';
      return { ...encodeImage(f.image, s(f, 'mime') || 'image/webp', encoding), errors: [], warnings: ['payload.image.readerNote'] };
    },
  },
  binary: {
    fields: [
      {
        key: 'source',
        type: 'select',
        label: 'binarySource',
        options: [
          { value: 'hex', label: 'option.hex' },
          { value: 'file', label: 'option.file' },
        ],
      },
      { key: 'hex', type: 'textarea', label: 'hex', rows: 4, placeholder: '48 65 6c 6c 6f', showIf: (f) => f.source !== 'file' },
      { key: 'file', type: 'file', label: 'file', showIf: (f) => f.source === 'file' },
    ],
    defaults: { source: 'hex', hex: '', file: null },
    build: (f) =>
      buildBinary({
        hex: s(f, 'hex'),
        file: f.file instanceof Uint8Array ? f.file : null,
        source: s(f, 'source') === 'file' ? 'file' : 'hex',
      }),
  },
};

/** Merges stored values into defaults, keeping only known keys with matching types. */
export function restoreFields(kind: PayloadKind, stored: Record<string, unknown>): FormValues {
  const out: FormValues = { ...FORMS[kind].defaults };
  for (const [k, def] of Object.entries(out)) {
    const v = stored[k];
    if (v === undefined) continue;
    if (def === null ? v instanceof Uint8Array || v === null : typeof v === typeof def) out[k] = v as FormValues[string];
  }
  return out;
}
