<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { formatNumber, t } from '../lib/i18n/index.svelte';
  import type { Meter } from '../lib/usage';

  const usage = $derived(app.usage);

  function percent(m: Meter): number {
    return m.limitBits > 0 ? Math.round((m.usedBits / m.limitBits) * 100) : 0;
  }

  function label(m: Meter): string {
    return m.count > 1 ? `${m.label} × ${m.count}` : m.label;
  }

  function level(m: Meter): 'ok' | 'warn' | 'error' {
    const p = m.usedBits / m.limitBits;
    return p > 1 ? 'error' : p > 0.9 ? 'warn' : 'ok';
  }
</script>

{#if usage}
  <div class="usage" aria-live="polite">
    <p class="counts">
      <span>{t('usage.chars', { n: formatNumber(usage.chars) })}</span>
      <span>{t('usage.bytes', { n: formatNumber(usage.bytes) })}</span>
    </p>
    {#each [usage.current ? { key: 'usage.current', m: usage.current } : null, { key: 'usage.limit', m: usage.limit }] as row (row?.key)}
      {#if row}
        <div class="meter">
          <div class="line">
            <span>{t(row.key, { label: label(row.m) })}</span>
            <span class="num {level(row.m)}">
              {formatNumber(row.m.usedBits)} / {formatNumber(row.m.limitBits)} bit ({percent(row.m)}%)
            </span>
          </div>
          <div
            class="track"
            role="meter"
            aria-label={t(row.key, { label: label(row.m) })}
            aria-valuemin="0"
            aria-valuemax={row.m.limitBits}
            aria-valuenow={Math.min(row.m.usedBits, row.m.limitBits)}>
            <span class="bar {level(row.m)}" style:width={`${Math.min(100, percent(row.m))}%`}></span>
          </div>
        </div>
      {/if}
    {/each}
    {#if usage.limit.usedBits > usage.limit.limitBits}
      <p class="msg error">{t('usage.over', { n: formatNumber(usage.limit.usedBits - usage.limit.limitBits) })}</p>
    {/if}
  </div>
{/if}

<style>
  .usage {
    display: grid;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-2);
    font-size: 12px;
  }
  p {
    margin: 0;
  }
  .counts {
    display: flex;
    gap: 16px;
    font-weight: 600;
  }
  .meter {
    display: grid;
    gap: 4px;
  }
  .line {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    color: var(--text-2);
  }
  .num {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .num.ok {
    color: var(--text);
  }
  .num.warn {
    color: var(--warn);
  }
  .num.error {
    color: var(--error);
  }
  .track {
    height: 6px;
    border-radius: 3px;
    background: var(--border);
    overflow: hidden;
  }
  .bar {
    display: block;
    height: 100%;
    background: var(--ok);
  }
  .bar.warn {
    background: var(--warn);
  }
  .bar.error {
    background: var(--error);
  }
</style>
