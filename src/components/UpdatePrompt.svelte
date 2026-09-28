<script lang="ts">
  import { useRegisterSW } from 'virtual:pwa-register/svelte';
  import { t } from '../lib/i18n/index.svelte';

  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW();
</script>

{#if $needRefresh || $offlineReady}
  <div class="toast card" role="status" aria-live="polite">
    <span>{$needRefresh ? t('app.update') : t('app.offlineReady')}</span>
    {#if $needRefresh}
      <button type="button" class="btn small primary" onclick={() => updateServiceWorker(true)}>{t('app.updateNow')}</button>
    {/if}
    <button
      type="button"
      class="btn small"
      onclick={() => {
        needRefresh.set(false);
        offlineReady.set(false);
      }}>{t('app.close')}</button>
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    right: 16px;
    bottom: max(16px, env(safe-area-inset-bottom));
    left: auto;
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    z-index: 30;
    max-width: calc(100vw - 32px);
  }
</style>
