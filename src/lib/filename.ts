import { sanitizeFilename } from './export/download';
import type { PayloadKind } from './payload';
import type { FormValues } from './payload/forms';

const MAX_PART = 40;

const str = (f: FormValues, k: string) => (typeof f[k] === 'string' ? (f[k] as string).trim() : '');

/** The part of the input that names the code best: the site, the network, the person... */
function namePart(kind: PayloadKind, f: FormValues, text: string | undefined): string {
  switch (kind) {
    case 'url':
    case 'gs1dl':
      try {
        const u = new URL(text ?? '');
        const path = u.pathname.replace(/\/+$/, '').replace(/^\//, '').replace(/\//g, '-');
        return path ? `${u.hostname}-${path}` : u.hostname;
      } catch {
        return '';
      }
    case 'wifi':
      return str(f, 'ssid') && `wifi-${str(f, 'ssid')}`;
    case 'vcard':
    case 'mecard':
      return [str(f, 'lastName'), str(f, 'firstName')].filter(Boolean).join('') || str(f, 'org');
    case 'tel':
    case 'sms':
      return str(f, 'tel');
    case 'email':
      return str(f, 'to');
    case 'event':
      return str(f, 'summary');
    case 'text':
      return (text ?? '').split(/\r?\n/)[0];
    default:
      return '';
  }
}

/** File name (without extension) for a QR code, from its content, e.g. "qr-example.com". */
export function qrFileName(kind: PayloadKind, fields: FormValues, text: string | undefined, fallback: string): string {
  const part = Array.from(namePart(kind, fields, text).replace(/\s+/g, '-')).slice(0, MAX_PART).join('');
  return part ? sanitizeFilename(`qr-${part}`, fallback) : fallback;
}
