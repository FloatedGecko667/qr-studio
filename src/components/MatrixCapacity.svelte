<script lang="ts">
  import { matrixInput, type BarcodeOptions } from '../lib/barcode';
  import { aztecBits } from '../lib/barcode/aztec';
  import { aztecCapacityRows, dmCapacityRows, dmUsed, pdfCapacityRows, type CapacityRow } from '../lib/barcode/capacity';
  import { layoutPdf417, pdf417Codewords } from '../lib/barcode/pdf417';
  import type { BarcodeState } from '../lib/barcode/state.svelte';
  import { formatNumber, t } from '../lib/i18n/index.svelte';

  let { code }: { code: BarcodeState } = $props();

  const NEARBY = 4;
  let showAll = $state(false);

  const type = $derived(code.settings.type);
  const o = $derived(code.settings.options);
  const input = $derived(matrixInput(type, code.value));
  const kind = $derived(type === 'pdf417' ? 'pdf' : type === 'aztec' ? 'aztec' : 'dm');
  /** Aztec is measured in bits, the others in codewords. */
  const unit = $derived(kind === 'aztec' ? 'bit' : 'cw');

  const rows: CapacityRow[] = $derived.by(() => {
    if (kind === 'aztec') return aztecCapacityRows(o.aztecEcc, input ? aztecBits(input.tokens as number[], input.eci) : null);
    if (kind === 'pdf') {
      const data = input ? pdf417Codewords(input.tokens as number[], input.eci).length : null;
      const layout = (level: number) => {
        try {
          return layoutPdf417(data ?? 0, { level, columns: o.pdfColumns });
        } catch {
          return null;
        }
      };
      return pdfCapacityRows(o.pdfColumns, data === null ? null : data + 1, layout);
    }
    return dmCapacityRows(o.dmShape, input ? dmUsed(input.tokens, input.eci) : null);
  });

  const fixed = $derived(kind === 'aztec' ? o.aztecSize : kind === 'pdf' ? String(o.pdfLevel) : o.dmSize);
  const current = $derived(code.result.ok && code.result.symbol.kind === 'matrix' ? code.result.symbol.sizeId : fixed);
  const currentIndex = $derived(rows.findIndex((r) => r.id === current));
  const fits = (r: CapacityRow) => r.available > 1 && r.used !== null && r.used <= r.available;
  /** Smallest size that fits (PDF417: the lowest level; its recommended level is the auto choice). */
  const smallestIndex = $derived(kind === 'pdf' ? -1 : rows.findIndex(fits));
  const anchor = $derived(currentIndex >= 0 ? currentIndex : Math.max(0, smallestIndex));
  const visible = $derived.by(() => {
    if (showAll) return rows.map((_, i) => i);
    const start = Math.max(0, anchor - NEARBY);
    const end = Math.min(rows.length, anchor + NEARBY + 1);
    return Array.from({ length: end - start }, (_, i) => start + i);
  });

  function patch(id: string | 'auto'): Partial<BarcodeOptions> {
    if (kind === 'aztec') return { aztecSize: id };
    if (kind === 'pdf') return { pdfLevel: id === 'auto' ? 'auto' : Number(id) };
    return { dmSize: id };
  }

  function select(r: CapacityRow) {
    if (r.available <= 1) return;
    code.updateOptions(patch(r.id));
  }

  const dims = (r: CapacityRow) =>
    r.width === 0 ? '—' : kind === 'pdf' ? t('capacity2d.pdfDims', { cols: (r.width - 69) / 17, rows: r.height }) : `${r.width} × ${r.height}`;
</script>

<section class="card stack" aria-labelledby="capacity2d-heading">
  <h2 id="capacity2d-heading">{t('section.capacity')}</h2>
  <p class="muted">{t(`capacity2d.hint.${kind}`)}</p>

  <div class="row">
    {#if fixed !== 'auto'}
      <button type="button" class="btn small" onclick={() => code.updateOptions(patch('auto'))}>{t('capacity2d.auto')}</button>
    {/if}
    <button type="button" class="btn small" aria-expanded={showAll} onclick={() => (showAll = !showAll)}>
      {showAll ? t('capacity.showNearby') : t('capacity.showAll', { count: rows.length })}
    </button>
  </div>

  <div class="scroll" class:tall={showAll}>
    <table>
      <!-- Data Matrix sizes are already given in modules, so their size column is enough. -->
      <thead>
        <tr>
          <th scope="col">{t(kind === 'pdf' ? 'capacity2d.level' : 'capacity2d.size')}</th>
          {#if kind !== 'dm'}<th scope="col">{t('capacity2d.modules')}</th>{/if}
          <th scope="col" class="num">{t('capacity.numeric')}</th>
          <th scope="col" class="num">{t('capacity2d.upper')}</th>
          <th scope="col" class="num">{t('capacity.byte')}</th>
          <th scope="col" class="num">{t(`capacity2d.unit.${unit}`)}</th>
          <th scope="col">{t('capacity.usage')}</th>
        </tr>
      </thead>
      <tbody>
        {#each visible as i (rows[i].id)}
          {@const r = rows[i]}
          {@const ok = fits(r)}
          {@const usable = r.available > 1}
          {@const isCurrent = i === currentIndex}
          <tr class:current={isCurrent} class:disabled={!usable} aria-current={isCurrent ? 'true' : undefined} onclick={() => select(r)}>
            <th scope="row">
              <button
                type="button"
                class="link"
                disabled={!usable}
                aria-label={t('capacity.select', { label: r.label })}
                onclick={(e) => {
                  e.stopPropagation();
                  select(r);
                }}>{r.label}</button>
            </th>
            {#if kind !== 'dm'}<td>{dims(r)}</td>{/if}
            {#if usable}
              <td class="num">{formatNumber(r.maxDigits)}</td>
              <td class="num">{formatNumber(r.maxUpper)}</td>
              <td class="num">{formatNumber(r.maxBytes)}</td>
              <td class="num">{formatNumber(r.available)}</td>
            {:else}
              <td colspan="4" class="muted">{t('capacity2d.tooManyEc')}</td>
            {/if}
            <td>
              {#if r.used !== null && usable}
                <span class="usage" title={`${formatNumber(r.used)} / ${formatNumber(r.available)} ${t(`capacity2d.unit.${unit}`)}`}>
                  <span class="bar" class:over={!ok} style:width={`${Math.min(100, (r.used / r.available) * 100)}%`}></span>
                </span>
                {#if ok}<span class="fit" title={t('capacity.fits')}>✓</span>{/if}
                {#if i === smallestIndex}<span class="badge">{t('capacity.smallest')}</span>{/if}
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<style>
  .scroll {
    overflow-x: auto;
    max-height: 420px;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .scroll.tall {
    max-height: 70vh;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  thead th {
    position: sticky;
    top: 0;
    background: var(--surface-2);
    z-index: 1;
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
  tr.disabled {
    cursor: default;
    opacity: 0.6;
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
  .link:disabled {
    color: var(--text-2);
    text-decoration: none;
  }
  .usage {
    display: inline-block;
    width: 56px;
    height: 6px;
    background: var(--surface-2);
    border-radius: 3px;
    overflow: hidden;
    vertical-align: middle;
  }
  .bar {
    display: block;
    height: 100%;
    background: var(--ok);
  }
  .bar.over {
    background: var(--error);
  }
  .fit {
    color: var(--ok);
    margin-left: 4px;
  }
  .badge {
    margin-left: 4px;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--ok-bg);
    color: var(--ok);
  }
</style>
