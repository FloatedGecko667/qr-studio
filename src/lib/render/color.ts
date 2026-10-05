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

/**
 * Perceived colour difference ("redmean" weighted RGB distance, 0 to about 765). Large values with a
 * low contrast ratio mean the colours differ in hue but not in brightness.
 */
export function colorDistance([r1, g1, b1]: [number, number, number], [r2, g2, b2]: [number, number, number]): number {
  const rm = (r1 + r2) / 2;
  const [dr, dg, db] = [r1 - r2, g1 - g2, b1 - b2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

/** Above this distance two colours look clearly different in hue even when equally bright. */
const HUE_DISTANCE = 150;

/**
 * lowContrast: too little brightness difference. hueOnly: the same, but the colours differ in hue
 * (red on green, for example), which people may expect to work: readers see only brightness, and
 * people with colour-vision deficiencies may not tell the colours apart either.
 */
export type ColorIssue = 'lowContrast' | 'hueOnly' | 'inverted';

/**
 * Readers expect dark modules on a light background with clear contrast. With a gradient every
 * module colour must pass, so each of `fg` is checked (the worst one decides).
 */
export function colorIssues(fg: string | readonly string[], bg: string, transparent: boolean): ColorIssue[] {
  const issues = new Set<ColorIssue>();
  const back = transparent ? '#ffffff' : bg;
  const b = parseHex(back);
  for (const c of typeof fg === 'string' ? [fg] : fg) {
    const f = parseHex(c);
    if (!f || !b) continue;
    if (contrastRatio(c, back) < 4) issues.add(colorDistance(f, b) > HUE_DISTANCE ? 'hueOnly' : 'lowContrast');
    if (luminance(f) > luminance(b)) issues.add('inverted');
  }
  return [...issues];
}
