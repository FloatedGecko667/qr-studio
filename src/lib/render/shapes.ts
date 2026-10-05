// Module and finder pattern shapes for QR codes. Finder patterns keep their 7×7 footprint and
// 1:1:3:1:1 proportions in every shape; data, timing and alignment modules take the module shape.

import type { SymbolGrid } from './svg';

export type ModuleShape = 'square' | 'rounded' | 'dot' | 'diamond' | 'vertical' | 'horizontal';
export type FinderShape = 'square' | 'rounded' | 'circle';
export type Gradient = 'none' | 'linear' | 'radial';

export const MODULE_SHAPES: readonly ModuleShape[] = ['square', 'rounded', 'dot', 'diamond', 'vertical', 'horizontal'];
export const FINDER_SHAPES: readonly FinderShape[] = ['square', 'rounded', 'circle'];
export const GRADIENTS: readonly Gradient[] = ['none', 'linear', 'radial'];

const n = (v: number) => String(Math.round(v * 1000) / 1000);

/**
 * Top-left corners of the 7×7 finder patterns (rMQR's 5×5 sub-finder keeps square modules).
 * Micro QR and rMQR have one finder, which the renderer always keeps square.
 */
export function finderOrigins(grid: SymbolGrid & { spec?: { type: string } }): { x: number; y: number }[] {
  const type = grid.spec?.type;
  if (type === 'model2') return [{ x: 0, y: 0 }, { x: grid.width - 7, y: 0 }, { x: 0, y: grid.height - 7 }];
  if (type === 'micro' || type === 'rmqr') return [{ x: 0, y: 0 }];
  return [];
}

/** Rounded rectangle (clockwise), radius clamped to half the shorter side. */
function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  if (rr <= 0) return `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}z`;
  return (
    `M${n(x + rr)} ${n(y)}h${n(w - 2 * rr)}a${n(rr)} ${n(rr)} 0 0 1 ${n(rr)} ${n(rr)}v${n(h - 2 * rr)}` +
    `a${n(rr)} ${n(rr)} 0 0 1 ${n(-rr)} ${n(rr)}h${n(-(w - 2 * rr))}a${n(rr)} ${n(rr)} 0 0 1 ${n(-rr)} ${n(-rr)}` +
    `v${n(-(h - 2 * rr))}a${n(rr)} ${n(rr)} 0 0 1 ${n(rr)} ${n(-rr)}z`
  );
}

function circle(cx: number, cy: number, r: number): string {
  return `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0z`;
}

/** Outer ring (7×7 with a 5×5 hole) and the 3×3 eye; drawn with fill-rule="evenodd". */
export function finderPath(x: number, y: number, outer: FinderShape, inner: FinderShape): string {
  const ring =
    outer === 'circle'
      ? circle(x + 3.5, y + 3.5, 3.5) + circle(x + 3.5, y + 3.5, 2.5)
      : outer === 'rounded'
        ? roundRect(x, y, 7, 7, 2) + roundRect(x + 1, y + 1, 5, 5, 1.4)
        : roundRect(x, y, 7, 7, 0) + roundRect(x + 1, y + 1, 5, 5, 0);
  const eye = inner === 'circle' ? circle(x + 3.5, y + 3.5, 1.5) : roundRect(x + 2, y + 2, 3, 3, inner === 'rounded' ? 0.9 : 0);
  return ring + eye;
}

/**
 * Path for the dark modules in `shape`, skipping `skip` (finder patterns, the logo area).
 * Shapes stay inside their module cell so neighbouring modules never merge into blobs.
 */
export function shapedModulesPath(grid: SymbolGrid, ox: number, oy: number, shape: ModuleShape, skip?: (x: number, y: number) => boolean): string {
  const dark = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < grid.width && y < grid.height && grid.modules[y * grid.width + x] === 1 && !skip?.(x, y);
  const parts: string[] = [];
  if (shape === 'vertical' || shape === 'horizontal') {
    const vertical = shape === 'vertical';
    const [outer, inner] = vertical ? [grid.width, grid.height] : [grid.height, grid.width];
    for (let a = 0; a < outer; a++) {
      let b = 0;
      while (b < inner) {
        const at = (k: number) => (vertical ? dark(a, k) : dark(k, a));
        if (!at(b)) {
          b++;
          continue;
        }
        const start = b;
        while (b < inner && at(b)) b++;
        const len = b - start;
        // A bar 0.84 wide with round ends, inset so parallel bars stay apart.
        parts.push(
          vertical
            ? roundRect(ox + a + 0.08, oy + start + 0.08, 0.84, len - 0.16, 0.42)
            : roundRect(ox + start + 0.08, oy + a + 0.08, len - 0.16, 0.84, 0.42),
        );
      }
    }
    return parts.join('');
  }
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (!dark(x, y)) continue;
      const px = ox + x;
      const py = oy + y;
      if (shape === 'dot') parts.push(circle(px + 0.5, py + 0.5, 0.45));
      else if (shape === 'diamond') parts.push(`M${n(px + 0.5)} ${n(py)}l.5 .5-.5 .5-.5-.5z`);
      else if (shape === 'rounded') parts.push(roundRect(px + 0.04, py + 0.04, 0.92, 0.92, 0.3));
      else parts.push(`M${px} ${py}h1v1h-1z`);
    }
  }
  return parts.join('');
}
