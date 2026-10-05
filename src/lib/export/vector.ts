// Turns the SVG produced by this app's renderers into vector drawing operations for PDF/EPS.
// Only the vocabulary those renderers emit is understood: top-level <rect>, <path> and <circle>
// with hex colours become vector shapes; everything else (text, images, groups, styles) is kept
// as an "overlay" SVG that the caller rasterises and draws on top. The renderers always put text
// and images after the shapes they overlap, so drawing the overlay last preserves the look.

export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0–1 */
  a: number;
}

export type Segment =
  | { op: 'M'; x: number; y: number }
  | { op: 'L'; x: number; y: number }
  | { op: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: 'Z' };

/** Two-stop gradient in SVG user space (gradientUnits="userSpaceOnUse"), as the renderer writes it. */
export type GradientFill =
  | { type: 'linear'; x1: number; y1: number; x2: number; y2: number; from: Rgba; to: Rgba }
  | { type: 'radial'; cx: number; cy: number; r: number; from: Rgba; to: Rgba };

export interface Shape {
  segments: Segment[];
  fill: Rgba | GradientFill | null;
  evenOdd: boolean;
  stroke: { color: Rgba; width: number } | null;
}

export interface VectorSvg {
  /** viewBox size in SVG user units. */
  width: number;
  height: number;
  shapes: Shape[];
  /** The remaining elements as a standalone SVG, or null when nothing is left to rasterise. */
  overlay: string | null;
}

export function parseColor(value: string | undefined): Rgba | null {
  if (!value || value === 'none') return null;
  const m = /^#([0-9a-f]{3,8})$/i.exec(value.trim());
  if (!m || ![3, 4, 6, 8].includes(m[1].length)) return null;
  const hex = m[1].length <= 4 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return { r: n(0) / 255, g: n(2) / 255, b: n(4) / 255, a: hex.length === 8 ? n(6) / 255 : 1 };
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z][\w:-]*)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

const num = (v: string | undefined, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Parses path data into absolute M/L/C/Z segments (arcs become cubic Béziers). */
export function parsePath(d: string): Segment[] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const out: Segment[] = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const next = () => Number(tokens[i++]);
  const isNum = () => i < tokens.length && !/[a-zA-Z]/.test(tokens[i]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'M': {
        x = (rel ? x : 0) + next();
        y = (rel ? y : 0) + next();
        sx = x;
        sy = y;
        out.push({ op: 'M', x, y });
        // Further pairs after a moveto are implicit linetos.
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L':
        x = (rel ? x : 0) + next();
        y = (rel ? y : 0) + next();
        out.push({ op: 'L', x, y });
        break;
      case 'H':
        x = (rel ? x : 0) + next();
        out.push({ op: 'L', x, y });
        break;
      case 'V':
        y = (rel ? y : 0) + next();
        out.push({ op: 'L', x, y });
        break;
      case 'C': {
        const ox = rel ? x : 0;
        const oy = rel ? y : 0;
        const [x1, y1, x2, y2, ex, ey] = [next() + ox, next() + oy, next() + ox, next() + oy, next() + ox, next() + oy];
        out.push({ op: 'C', x1, y1, x2, y2, x: ex, y: ey });
        x = ex;
        y = ey;
        break;
      }
      case 'A': {
        const [rx, ry, rot, large, sweep] = [next(), next(), next(), next(), next()];
        const ex = (rel ? x : 0) + next();
        const ey = (rel ? y : 0) + next();
        out.push(...arcToCubics(x, y, rx, ry, rot, large !== 0, sweep !== 0, ex, ey));
        x = ex;
        y = ey;
        break;
      }
      case 'Z':
        out.push({ op: 'Z' });
        x = sx;
        y = sy;
        // A Z takes no numbers; skip to the next command.
        if (isNum()) cmd = 'L';
        break;
      default:
        // Unknown command: stop rather than guess.
        return out;
    }
  }
  return out;
}

/** SVG elliptical arc (endpoint form) to cubic Béziers, per SVG 1.1 implementation notes F.6. */
function arcToCubics(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  rotDeg: number,
  large: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
): Segment[] {
  if (x1 === x2 && y1 === y2) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [{ op: 'L', x: x2, y: y2 }];
  const phi = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy;
  const yp = -sin * dx + cos * dy;
  const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const sign = large === sweep ? -1 : 1;
  const num2 = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const coef = sign * Math.sqrt(Math.max(0, num2 / (rx * rx * yp * yp + ry * ry * xp * xp)));
  const cxp = (coef * rx * yp) / ry;
  const cyp = (-coef * ry * xp) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = angle(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = angle((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9);
  const step = dt / n;
  const k = (4 / 3) * Math.tan(step / 4);
  const point = (t: number) => ({
    x: cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
    y: cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
  });
  const deriv = (t: number) => ({
    x: -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin,
    y: -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos,
  });
  const out: Segment[] = [];
  for (let j = 0; j < n; j++) {
    const a = t1 + j * step;
    const b = a + step;
    const p0 = point(a);
    const p3 = j === n - 1 ? { x: x2, y: y2 } : point(b);
    const d0 = deriv(a);
    const d3 = deriv(b);
    out.push({ op: 'C', x1: p0.x + k * d0.x, y1: p0.y + k * d0.y, x2: p3.x - k * d3.x, y2: p3.y - k * d3.y, x: p3.x, y: p3.y });
  }
  return out;
}

function rectSegments(a: Record<string, string>): Segment[] {
  const x = num(a.x);
  const y = num(a.y);
  const w = num(a.width);
  const h = num(a.height);
  if (w <= 0 || h <= 0) return [];
  return [{ op: 'M', x, y }, { op: 'L', x: x + w, y }, { op: 'L', x: x + w, y: y + h }, { op: 'L', x, y: y + h }, { op: 'Z' }];
}

function circleSegments(a: Record<string, string>): Segment[] {
  const cx = num(a.cx);
  const cy = num(a.cy);
  const r = num(a.r);
  if (r <= 0) return [];
  return parsePath(`M${cx - r} ${cy}A${r} ${r} 0 1 1 ${cx + r} ${cy}A${r} ${r} 0 1 1 ${cx - r} ${cy}Z`);
}

/** Splits an app-rendered SVG into vector shapes and an overlay SVG with the rest. */
export function vectorizeSvg(svg: string): VectorSvg {
  const open = /^<svg\b[^>]*>/.exec(svg);
  if (!open || !svg.endsWith('</svg>')) throw new Error('not an app SVG');
  const root = attrs(open[0]);
  const vb = (root.viewBox ?? '').split(/[\s,]+/).map(Number);
  const width = vb[2] || num(root.width);
  const height = vb[3] || num(root.height);
  const body = svg.slice(open[0].length, -'</svg>'.length);

  const gradients = parseGradients(body);
  const shapes: Shape[] = [];
  const rest: string[] = [];
  let hasVisibleRest = false;
  // Top-level children: self-closing elements, or elements with content up to their closing tag.
  const child = /<([a-zA-Z]+)\b[^>]*?(\/>|>[\s\S]*?<\/\1>)/g;
  for (const m of body.matchAll(child)) {
    const tag = m[1];
    const el = m[0];
    const a = attrs(el.slice(0, el.indexOf('>') + 1));
    const selfClosing = m[2] === '/>';
    const segments =
      selfClosing && tag === 'rect' && !a.rx ? rectSegments(a) : selfClosing && tag === 'path' ? parsePath(a.d ?? '') : selfClosing && tag === 'circle' ? circleSegments(a) : null;
    const ref = /^url\(#([\w-]+)\)$/.exec(a.fill ?? '');
    const fill = a.fill === undefined ? parseColor('#000000') : ref ? (gradients.get(ref[1]) ?? null) : parseColor(a.fill);
    const strokeColor = parseColor(a.stroke);
    const fillOk = a.fill === undefined || a.fill === 'none' || fill !== null;
    const strokeOk = a.stroke === undefined || a.stroke === 'none' || strokeColor !== null;
    if (segments && fillOk && strokeOk && !a.transform && !a.opacity) {
      if (segments.length) {
        shapes.push({
          segments,
          fill,
          evenOdd: a['fill-rule'] === 'evenodd',
          stroke: strokeColor ? { color: strokeColor, width: num(a['stroke-width'], 1) } : null,
        });
      }
      continue;
    }
    // Gradients are read above; they need not go to the overlay.
    if (tag === 'defs') continue;
    rest.push(el);
    if (tag !== 'style') hasVisibleRest = true;
  }
  const overlay = hasVisibleRest ? `${open[0]}${rest.join('')}</svg>` : null;
  return { width, height, shapes, overlay };
}

/** Two-stop linear and radial gradients defined in <defs>, by id. */
function parseGradients(body: string): Map<string, GradientFill> {
  const out = new Map<string, GradientFill>();
  for (const m of body.matchAll(/<(linearGradient|radialGradient)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const a = attrs(m[2]);
    if (!a.id || a.gradientUnits !== 'userSpaceOnUse') continue;
    const stops = [...m[3].matchAll(/<stop\b[^>]*\/>/g)].map((x) => parseColor(attrs(x[0])['stop-color']));
    if (stops.length !== 2 || !stops[0] || !stops[1]) continue;
    const [from, to] = stops as [Rgba, Rgba];
    out.set(
      a.id,
      m[1] === 'linearGradient'
        ? { type: 'linear', x1: num(a.x1), y1: num(a.y1), x2: num(a.x2), y2: num(a.y2), from, to }
        : { type: 'radial', cx: num(a.cx), cy: num(a.cy), r: num(a.r), from, to },
    );
  }
  return out;
}

export const isGradient = (f: Rgba | GradientFill | null): f is GradientFill => !!f && 'type' in f;
