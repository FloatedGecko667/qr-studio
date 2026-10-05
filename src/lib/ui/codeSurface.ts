/**
 * Keeps a rendered code readable under browser-forced dark modes (Chrome "Auto Dark Mode for Web Contents").
 *
 * The element also gets the official opt-outs (`color-scheme: only light`, `forced-color-adjust: none`
 * via `.code-surface` in app.css), but Chromium's force-dark ignores `color-scheme` below the root and
 * darkens inline SVG and black-and-white images inside such elements. It does leave <canvas> pixels
 * alone, so the SVG is painted onto a canvas laid over it; the SVG stays in the DOM (hidden) for
 * layout and structure. If painting fails, the SVG simply stays visible.
 */
export function codeSurface(node: HTMLElement) {
  const canvas = document.createElement('canvas');
  canvas.className = 'code-surface-paint';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.hidden = true;
  node.append(canvas);

  let token = 0;
  let lastKey = '';

  async function paint() {
    // {@html} updates replace the element's whole content, taking the canvas with it.
    if (canvas.parentNode !== node) {
      canvas.hidden = true;
      lastKey = '';
      node.append(canvas);
    }
    const svg = node.querySelector<SVGSVGElement>(':scope > svg, :scope > * > svg');
    if (!svg) {
      canvas.hidden = true;
      lastKey = '';
      return;
    }
    const box = svg.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(box.width * dpr);
    const h = Math.round(box.height * dpr);
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.removeAttribute('style');
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));
    const source = new XMLSerializer().serializeToString(clone);
    const key = `${w}x${h}:${source}`;
    if (key === lastKey && !canvas.hidden) return;
    lastKey = key;

    const mine = ++token;
    const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      if (mine !== token) return;
      const host = node.getBoundingClientRect();
      const now = svg.getBoundingClientRect();
      canvas.width = w;
      canvas.height = h;
      canvas.style.left = `${now.left - host.left}px`;
      canvas.style.top = `${now.top - host.top}px`;
      canvas.style.width = `${now.width}px`;
      canvas.style.height = `${now.height}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.hidden = false;
      svg.style.visibility = 'hidden';
    } catch {
      if (mine !== token) return;
      canvas.hidden = true;
      svg.style.visibility = '';
      lastKey = '';
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      void paint();
    });
  };

  const mo = new MutationObserver((records) => {
    // Our own canvas insertion is not a content change.
    if (records.every((r) => r.target === canvas)) return;
    schedule();
  });
  mo.observe(node, { subtree: true, childList: true, attributes: true, characterData: true });
  const ro = new ResizeObserver(schedule);
  ro.observe(node);
  schedule();

  return {
    destroy() {
      token++;
      mo.disconnect();
      ro.disconnect();
      canvas.remove();
    },
  };
}
