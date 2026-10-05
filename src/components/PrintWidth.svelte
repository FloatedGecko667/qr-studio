<script lang="ts">
  import { barsWidth, HAS_ADDON } from '../lib/barcode';
  import { renderBarcodeSvg } from '../lib/barcode/render';
  import type { BarcodeState } from '../lib/barcode/state.svelte';
  import { formatNumber, t } from '../lib/i18n/index.svelte';

  let { code }: { code: BarcodeState } = $props();

  // JAN/EAN and UPC print at 80-200% of 0.330 mm; other symbologies at common X dimensions.
  const RETAIL_X: [number, string][] = [
    [0.264, '80%'],
    [0.33, '100%'],
    [0.495, '150%'],
    [0.66, '200%'],
  ];
  // Japan Post: the bar width follows the point size (0.6 mm at 10 pt).
  const POSTAL_X: [number, string][] = [
    [0.48, '8pt'],
    [0.54, '9pt'],
    [0.6, '10pt'],
    [0.66, '11pt'],
    [0.69, '11.5pt'],
  ];
  const GENERAL_X: [number, string][] = [
    [0.19, ''],
    [0.25, ''],
    [0.33, ''],
    [0.5, ''],
    [1, ''],
  ];

  const res = $derived(code.result);
  const out = $derived(code.settings.output);
  const symbol = $derived(res.ok && res.symbol.kind !== 'matrix' ? res.symbol : null);
  const svg = $derived(symbol ? renderBarcodeSvg(symbol, code.settings.style) : null);
  const retail = $derived(HAS_ADDON.has(code.settings.type) || code.settings.type === 'bookjan');
  const choices = $derived(code.settings.type === 'japanpost' ? POSTAL_X : retail ? RETAIL_X : GENERAL_X);
  /** Printer dots per module at the current dpi (image output rounds the X dimension to them). */
  const dots = (x: number) => Math.max(1, Math.round((x * out.dpi) / 25.4));
  const mm = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
  const currentX = $derived(out.unit === 'mm' ? out.moduleMm : null);

  function apply(x: number) {
    code.updateOutput({ unit: 'mm', moduleMm: x });
  }
</script>

<section class="card stack" aria-labelledby="print-width-heading">
  <h2 id="print-width-heading">{t('printWidth.title')}</h2>
  {#if symbol && svg}
    <dl class="summary">
      <div>
        <dt>{t('printWidth.modules')}</dt>
        <dd>
          {t('printWidth.modulesValue', {
            total: formatNumber(Math.round(svg.widthUnits * 10) / 10),
            bars: formatNumber(Math.round(barsWidth(symbol) * 10) / 10),
          })}
        </dd>
      </div>
      <div>
        <dt>{t('printWidth.current')}</dt>
        <dd>
          {#if currentX !== null}
            {t('printWidth.size', { w: mm(svg.widthUnits * currentX), h: mm(svg.heightUnits * currentX) })}（X = {currentX} mm）
          {:else}
            {t('printWidth.sizePx', { w: formatNumber(svg.widthUnits * out.modulePx), h: formatNumber(svg.heightUnits * out.modulePx) })}
          {/if}
        </dd>
      </div>
    </dl>

    <table>
      <thead>
        <tr>
          <th scope="col">{t('printWidth.x')}</th>
          <th scope="col" class="num">{t('printWidth.width')}</th>
          <th scope="col" class="num">{t('printWidth.height')}</th>
          <th scope="col" class="num">{t('printWidth.dots', { dpi: out.dpi })}</th>
        </tr>
      </thead>
      <tbody>
        {#each choices as [x, note] (x)}
          {@const isCurrent = currentX !== null && Math.abs(currentX - x) < 0.0005}
          <tr class:current={isCurrent} aria-current={isCurrent ? 'true' : undefined} onclick={() => apply(x)}>
            <th scope="row">
              <button
                type="button"
                class="link"
                aria-label={t('printWidth.apply', { x })}
                onclick={(e) => {
                  e.stopPropagation();
                  apply(x);
                }}>{x} mm{note ? `（${note}）` : ''}</button>
            </th>
            <td class="num">{mm(svg.widthUnits * x)} mm</td>
            <td class="num">{mm(svg.heightUnits * x)} mm</td>
            <td class="num">{dots(x)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="muted">{t(retail ? 'printWidth.hintRetail' : 'printWidth.hint')}</p>
    {#if code.settings.type.startsWith('code128') || code.settings.type === 'gs1-128'}
      <p class="muted">{t('printWidth.code128Tip')}</p>
    {/if}
  {:else}
    <p class="muted">{t('printWidth.none')}</p>
  {/if}
</section>

<style>
  p {
    margin: 0;
  }
  .summary {
    display: grid;
    gap: 6px;
    margin: 0;
  }
  .summary div {
    display: grid;
    grid-template-columns: minmax(8em, max-content) minmax(0, 1fr);
    gap: 12px;
  }
  dt {
    font-size: 12px;
    color: var(--text-2);
    font-weight: 600;
  }
  dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    border: 1px solid var(--border);
  }
  thead th {
    background: var(--surface-2);
  }
  th,
  td {
    padding: 5px 8px;
    text-align: left;
    white-space: nowrap;
    border-bottom: 1px solid var(--border);
  }
  .num {
    text-align: right;
  }
  tbody tr {
    cursor: pointer;
  }
  tbody tr:hover {
    background: var(--surface-2);
  }
  tr.current {
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    font-weight: 700;
  }
  .link {
    border: 0;
    background: none;
    padding: 0;
    color: var(--accent);
    font-weight: inherit;
    cursor: pointer;
    text-decoration: underline;
  }
  @media (max-width: 480px) {
    .summary div {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
    }
  }
</style>
