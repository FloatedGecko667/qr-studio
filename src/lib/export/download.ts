import { zipSync } from 'fflate';

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Copies an image to the clipboard; Safari and Chrome only accept PNG. */
export async function copyImage(png: Blob): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/** Removes characters that are invalid in file names on common platforms. */
export function sanitizeFilename(name: string, fallback = 'qr'): string {
  const cleaned = name
    // oxlint-disable-next-line no-control-regex -- control characters are invalid in file names
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

/** Makes file names unique (case-insensitive) by appending -2, -3, ... before the extension. */
export function uniqueNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((n) => {
    const dot = n.lastIndexOf('.');
    const [base, ext] = dot > 0 ? [n.slice(0, dot), n.slice(dot)] : [n, ''];
    let candidate = n;
    for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${base}-${i}${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

export async function zipFiles(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const entries: Record<string, Uint8Array> = {};
  const names = uniqueNames(files.map((f) => f.name));
  for (const [i, f] of files.entries()) entries[names[i]] = new Uint8Array(await f.blob.arrayBuffer());
  return new Blob([zipSync(entries, { level: 6 }) as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}
