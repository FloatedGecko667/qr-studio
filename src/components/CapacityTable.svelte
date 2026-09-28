<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { encodeOptions, preparePayload } from '../lib/pipeline';
  import { capacityRows, type CapacityRow } from '../lib/encoder/capacity';
  import { ecLevelsFor, requiredBits, splitUnits, versionLabel, type EcLevel } from '../lib/encoder';
  import { formatNumber, t } from '../lib/i18n/index.svelte';

  const NEARBY = 4;
  let showAll = $state(false);
  let ecFilter: EcLevel | 'all' = $state('all');

  const sym = $derived(app.settings.symbol);
  const prepared = $derived(preparePayload(app.payload, sym.charset));
  const opts = $derived(prepared && prepared !== 'charset' ? encodeOptions(sym, prepared) : null);
  const featureOpts = $derived({
    eci: opts?.eci,
    fnc1: opts?.fnc1,
    structuredAppend: sym.structuredAppend,
  });
  const rows: CapacityRow[] = $derived(capacityRows(sym.type, featureOpts));
  const filtered = $derived(ecFilter === 'all' ? rows : rows.filter((r) => r.spec.ecLevel === ecFilter));

  const parts = $derived.by(() => {
    if (!prepared || prepared === 'charset') return null;
    return sym.structuredAppend > 1 ? splitUnits(prepared.units, sym.structuredAppend) : [prepared.units];
  });

  /** Bits used by the largest part, or null when there is no valid input. */
  function usage(r: CapacityRow): number | null {
    if (!parts || !opts || r.unsupported) return null;
    return Math.max(...parts.map((p) => requiredBits(p, r.spec, opts)));
  }

  const usages = $derived(filtered.map(usage));
  const smallestIndex = $derived.by(() => {
    let best = -1;
    filtered.forEach((r, i) => {
      const u = usages[i];
      if (u === null || u > r.spec.dataBits || r.spec.ecLevel !== sym.ecLevel) return;
      if (best < 0 || r.spec.width * r.spec.height < filtered[best].spec.width * filtered[best].spec.height) best = i;
    });
    return best;
  });

  const current = $derived.by(() => {
    if (app.pipeline.status === 'ok') {
      const s = app.pipeline.result.symbols[0].spec;
      return { version: s.version, ecLevel: s.ecLevel };
    }
    return sym.version === 'auto' ? null : { version: sym.version, ecLevel: sym.ecLevel };
  });
  const currentIndex = $derived(filtered.findIndex((r) => current && r.spec.version === current.version && r.spec.ecLevel === current.ecLevel));
  const anchor = $derived(currentIndex >= 0 ? currentIndex : Math.max(0, smallestIndex));
  const visible = $derived.by(() => {
    if (showAll) return filtered.map((_, i) => i);
    const start = Math.max(0, anchor - NEARBY);
    const end = Math.min(filtered.length, anchor + NEARBY + 1);
    return Array.from({ length: end - start }, (_, i) => start + i);
  });

  const cell = (n: number | null) => (n === null ? '—' : formatNumber(n));

  function select(r: CapacityRow) {
    if (r.unsupported) return;
    app.updateSymbol({ version: r.spec.version, ecLevel: r.spec.ecLevel });
  }
</script>

<section class="card stack" aria-labelledby="capacity-heading">
  <h2 id="capacity-heading">{t('section.capacity')}</h2>
  <p class="muted">{t('capacity.hint')}</p>
  {#if sym.structuredAppend > 1}
    <p class="muted">{t('capacity.appendNote', { count: sym.structuredAppend })}</p>
  {/if}

  <div class="row">
    <label class="field inline">
      <span>{t('capacity.filterEc')}</span>
      <select bind:value={ecFilter}>
        <option value="all">{t('capacity.all')}</option>
        {#each ecLevelsFor(sym.type) as l (l)}
          <option value={l}>{l}</option>
        {/each}
      </select>
    </label>
    <button type="button" class="btn small" aria-expanded={showAll} onclick={() => (showAll = !showAll)}>
      {showAll ? t('capacity.showNearby') : t('capacity.showAll', { count: filtered.length })}
    </button>
  </div>

  <div class="scroll" class:tall={showAll}>
    <table>
      <thead>
        <tr>
          <th scope="col">{t('capacity.version')}</th>
          <th scope="col">{t('capacity.ec')}</th>
          <th scope="col" class="num">{t('capacity.numeric')}</th>
          <th scope="col" class="num">{t('capacity.alnum')}</th>
          <th scope="col" class="num">{t('capacity.byte')}</th>
          <th scope="col" class="num">{t('capacity.kanji')}</th>
          <th scope="col" class="num">{t('capacity.bits')}</th>
          <th scope="col">{t('capacity.usage')}</th>
        </tr>
      </thead>
      <tbody>
        {#each visible as i (filtered[i].spec.label)}
          {@const r = filtered[i]}
          {@const u = usages[i]}
          {@const fits = u !== null && u <= r.spec.dataBits}
          {@const isCurrent = i === currentIndex}
          <tr
            class:current={isCurrent}
            class:disabled={!!r.unsupported}
            aria-current={isCurrent ? 'true' : undefined}
            onclick={() => select(r)}>
            <th scope="row">
              <button
                type="button"
                class="link"
                disabled={!!r.unsupported}
                aria-label={t('capacity.select', { label: r.spec.label })}
                onclick={(e) => {
                  e.stopPropagation();
                  select(r);
                }}>{versionLabel(sym.type, r.spec.version)}</button>
            </th>
            <td>{r.spec.ecLevel}</td>
            {#if r.unsupported}
              <td colspan="5" class="muted">{t('capacity.unsupported')}</td>
            {:else}
              <td class="num">{cell(r.numeric)}</td>
              <td class="num">{cell(r.alnum)}</td>
              <td class="num">{cell(r.byte)}</td>
              <td class="num">{cell(r.kanji)}</td>
              <td class="num">{formatNumber(r.availableBits)}</td>
            {/if}
            <td>
              {#if u !== null}
                <span class="usage" title={`${formatNumber(u)} / ${formatNumber(r.spec.dataBits)} bit`}>
                  <span class="bar" class:over={!fits} style:width={`${Math.min(100, (u / r.spec.dataBits) * 100)}%`}></span>
                </span>
                {#if fits}<span class="fit" title={t('capacity.fits')}>✓</span>{/if}
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
  p {
    margin: 0;
  }
  .inline {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .inline select {
    width: auto;
  }
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
