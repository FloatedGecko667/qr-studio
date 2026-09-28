<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';

  /** The preview card to mirror. Its `.symbol` (first one) and `.status` are copied into the dock. */
  let { anchor }: { anchor: HTMLElement | undefined } = $props();

  // The dock only exists in the single-column layout, where the preview scrolls away.
  const SINGLE_COLUMN = '(max-width: 860px)';

  let hidden = $state(false);
  let narrow = $state(false);
  let thumb = $state('');
  let status = $state('');
  let count = $state(0);

  $effect(() => {
    const mq = window.matchMedia(SINGLE_COLUMN);
    narrow = mq.matches;
    const onChange = () => (narrow = mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  });

  $effect(() => {
    const el = anchor;
    if (!el || !narrow) return;
    const canvas = el.querySelector('.canvas') ?? el;
    const ribbon = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ribbon-h')) || 0;
    // Show the dock once the symbol has scrolled up under the ribbon (not when it is below the fold).
    const io = new IntersectionObserver(
      ([e]) => (hidden = !e.isIntersecting && e.boundingClientRect.top < ribbon),
      { rootMargin: `-${Math.round(ribbon)}px 0px 0px 0px` },
    );
    io.observe(canvas);
    return () => io.disconnect();
  });

  $effect(() => {
    const el = anchor;
    if (!el || !narrow) return;
    // Mirror the rendered SVG (generated and escaped by the preview) and its status line.
    const copy = () => {
      const symbols = el.querySelectorAll('.symbol');
      count = symbols.length;
      thumb = symbols[0]?.innerHTML ?? '';
      status = (el.querySelector('.status, [role="alert"]')?.textContent ?? '').trim();
    };
    copy();
    const mo = new MutationObserver(copy);
    mo.observe(el, { subtree: true, childList: true, characterData: true });
    return () => mo.disconnect();
  });

  function reveal() {
    anchor?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
</script>

{#if narrow && hidden}
  <button type="button" class="dock" onclick={reveal} aria-label={t('dock.show')}>
    <span class="thumb" aria-hidden="true">
      {#if thumb}{@html thumb}{/if}
    </span>
    <span class="text">
      <span class="title">{t('section.preview')}{#if count > 1}&nbsp;×{count}{/if}</span>
      <span class="status">{status}</span>
    </span>
    <svg class="up" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6l-7 7 1.4 1.4L12 8.8l5.6 5.6L19 13z" fill="currentColor" /></svg>
  </button>
{/if}

<style>
  .dock {
    position: fixed;
    top: var(--ribbon-h, 0px);
    left: 0;
    right: 0;
    z-index: 15;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 6px max(12px, env(safe-area-inset-left));
    border: 0;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--surface) 94%, transparent);
    backdrop-filter: blur(8px);
    box-shadow: 0 4px 12px rgb(0 0 0 / 10%);
    text-align: left;
    cursor: pointer;
  }
  .thumb {
    flex: none;
    display: grid;
    place-items: center;
    min-width: 56px;
    max-width: 45vw;
    height: 56px;
    padding: 2px;
    border-radius: 6px;
    background: repeating-conic-gradient(var(--surface-2) 0% 25%, var(--surface) 0% 50%) 50% / 8px 8px;
    line-height: 0;
  }
  /* Height-driven so wide barcodes keep their aspect ratio (their SVG does not preserve it). */
  .thumb :global(svg) {
    height: 100%;
    width: auto;
    max-width: 100%;
  }
  .text {
    display: grid;
    min-width: 0;
    flex: 1;
  }
  .title {
    font-weight: 700;
    font-size: 13px;
  }
  .status {
    font-size: 12px;
    color: var(--text-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Landscape phones: keep the dock short so the form keeps most of the height. */
  @media (max-height: 500px) {
    .thumb {
      height: 40px;
      min-width: 40px;
    }
  }
  .up {
    flex: none;
    width: 22px;
    height: 22px;
    color: var(--text-2);
  }
</style>
