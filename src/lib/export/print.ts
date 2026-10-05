// Prints rendered SVGs at their physical size through the browser's print dialog.
// A temporary print-only container holds one SVG per page; everything else is hidden in print.

export interface PrintItem {
  svg: string;
  /** Size attributes as exported: "30mm" for mm output, plain pixels otherwise. */
  svgAttr: { width: string; height: string };
}

/** CSS pixels per inch, used for pixel-sized output. */
const PX_PER_INCH = 96;

/** Size in millimetres of an exported size attribute ("30mm", or pixels at 96 dpi). */
export function toMm(value: string): number {
  const n = parseFloat(value);
  return value.endsWith('mm') ? n : (n / PX_PER_INCH) * 25.4;
}

const fmt = (mm: number) => `${Math.round(mm * 1000) / 1000}mm`;

/** The stylesheet for printing: page size = the largest item, no margins, only the print root shown. */
export function printCss(items: readonly PrintItem[]): string {
  const w = Math.max(...items.map((i) => toMm(i.svgAttr.width)));
  const h = Math.max(...items.map((i) => toMm(i.svgAttr.height)));
  return [
    `@page { size: ${fmt(w)} ${fmt(h)}; margin: 0; }`,
    '#qr-print-root { display: none; }',
    '@media print {',
    '  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }',
    '  body > :not(#qr-print-root) { display: none !important; }',
    '  #qr-print-root { display: block; }',
    '  #qr-print-root .page { break-after: page; line-height: 0; }',
    '  #qr-print-root .page:last-child { break-after: auto; }',
    '  #qr-print-root svg { display: block; }',
    '}',
  ].join('\n');
}

/** Opens the print dialog for the items; resolves once printing has finished or been cancelled. */
export async function printSvgs(items: readonly PrintItem[]): Promise<void> {
  if (!items.length) return;
  document.getElementById('qr-print-root')?.remove();
  document.getElementById('qr-print-style')?.remove();

  const style = document.createElement('style');
  style.id = 'qr-print-style';
  style.textContent = printCss(items);
  const root = document.createElement('div');
  root.id = 'qr-print-root';
  for (const it of items) {
    const page = document.createElement('div');
    page.className = 'page';
    // The SVGs come from this app's renderers (text escaped, colours validated).
    page.innerHTML = it.svg.replace(/^<svg /, `<svg width="${fmt(toMm(it.svgAttr.width))}" height="${fmt(toMm(it.svgAttr.height))}" `);
    root.append(page);
  }
  document.head.append(style);
  document.body.append(root);

  // Removed after printing. Where print() returns before the dialog has rendered (some mobile
  // browsers), removing earlier would print a blank page, so leftovers are swept on the next print;
  // they are hidden outside print anyway.
  await new Promise<void>((resolve) => {
    const done = () => {
      window.removeEventListener('afterprint', done);
      root.remove();
      style.remove();
      resolve();
    };
    window.addEventListener('afterprint', done);
    window.print();
  });
}
