/** Gap kept between a sticky column and the ribbon above it / the viewport edge below it. */
const GAP = 12;

function ribbonHeight(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ribbon-h')) || 0;
}

/**
 * Keeps a column in view while the page scrolls, without giving it its own scrollbar.
 *
 * A column shorter than the viewport simply sticks below the ribbon. A taller one moves with
 * the page until its bottom (scrolling down) or top (scrolling up) reaches the viewport edge and
 * then sticks there, so one scroll gesture always moves the whole page and every part of the
 * column stays reachable. Only active while the element is actually `position: sticky`.
 */
export function stickySidebar(node: HTMLElement) {
  let top = 0;
  let lastY = window.scrollY;
  // Cached: reading computed style on every scroll event would force a style recalculation.
  let active = false;
  let upper = 0;

  function measure() {
    active = getComputedStyle(node).position === 'sticky';
    upper = ribbonHeight() + GAP;
    if (!active) node.style.top = '';
    else update();
  }

  function update() {
    const y = window.scrollY;
    const delta = y - lastY;
    lastY = y;
    if (!active) return;
    const lower = window.innerHeight - node.offsetHeight - GAP;
    // Fits: plain sticky. Too tall: slide `top` between the two edges with the scroll.
    top = lower >= upper ? upper : Math.min(upper, Math.max(lower, top - delta));
    node.style.top = `${top}px`;
  }

  // The ribbon height is published as a CSS variable after mount, so re-measure on its resizes too.
  const resize = new ResizeObserver(measure);
  resize.observe(node);
  resize.observe(document.documentElement);
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', measure);
  top = Number.POSITIVE_INFINITY;
  measure();

  return {
    destroy() {
      resize.disconnect();
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', measure);
      node.style.top = '';
    },
  };
}
