/**
 * Makes a logo's plain background transparent: starting from the border, pixels close to the
 * colour of the corners are cleared (flood fill, so the same colour inside the logo is kept).
 * Soft edges get partial transparency. Works on straight RGBA in place; returns the cleared count.
 */
export function clearBackground(rgba: Uint8ClampedArray, width: number, height: number, tolerance = 32): number {
  const at = (x: number, y: number) => (y * width + x) * 4;
  // The most common corner colour is taken as the background.
  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)];
  const key = (i: number) => `${rgba[i] >> 3},${rgba[i + 1] >> 3},${rgba[i + 2] >> 3},${rgba[i + 3] >> 6}`;
  const counts = new Map<string, number>();
  for (const c of corners) counts.set(key(c), (counts.get(key(c)) ?? 0) + 1);
  const best = corners.reduce((a, b) => ((counts.get(key(b)) ?? 0) > (counts.get(key(a)) ?? 0) ? b : a));
  const [br, bg, bb, ba] = [rgba[best], rgba[best + 1], rgba[best + 2], rgba[best + 3]];
  if (ba === 0) return 0;

  const dist = (i: number) => Math.max(Math.abs(rgba[i] - br), Math.abs(rgba[i + 1] - bg), Math.abs(rgba[i + 2] - bb));
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const p = y * width + x;
    if (!seen[p]) {
      seen[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  let cleared = 0;
  while (stack.length) {
    const p = stack.pop()!;
    const i = p * 4;
    const d = dist(i);
    if (d > tolerance * 2) continue;
    // Within the tolerance: fully clear; up to twice the tolerance: fade (anti-aliased edges).
    const alpha = d <= tolerance ? 0 : Math.round(((d - tolerance) / tolerance) * rgba[i + 3]);
    if (alpha < rgba[i + 3]) {
      rgba[i + 3] = alpha;
      cleared++;
    }
    if (d > tolerance) continue;
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }
  return cleared;
}
