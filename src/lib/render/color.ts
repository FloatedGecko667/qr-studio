/** Parses #rgb / #rrggbb (alpha ignored) into 0-255 channels. */
export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio (1-21). */
export function contrastRatio(a: string, b: string): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return 1;
  const la = luminance(ca);
  const lb = luminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export type ColorIssue = 'lowContrast' | 'inverted';

/** Readers expect dark modules on a light background with clear contrast. */
export function colorIssues(fg: string, bg: string, transparent: boolean): ColorIssue[] {
  const issues: ColorIssue[] = [];
  const f = parseHex(fg);
  const b = parseHex(transparent ? '#ffffff' : bg);
  if (!f || !b) return issues;
  if (contrastRatio(fg, transparent ? '#ffffff' : bg) < 4) issues.push('lowContrast');
  if (luminance(f) > luminance(b)) issues.push('inverted');
  return issues;
}
