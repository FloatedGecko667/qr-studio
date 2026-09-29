<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { formatNumber, t } from '../lib/i18n/index.svelte';
  import { restoreFields, type FormValues } from '../lib/payload/forms';
  import {
    deleteTemplate,
    listTemplates,
    saveTemplate,
    secretKeys,
    TEMPLATE_LIMIT,
    TEMPLATE_NAME_MAX,
    type InputTemplate,
  } from '../lib/storage/templates';

  let open = $state(false);
  let templates: InputTemplate[] = $state.raw([]);
  let selected = $state('');
  let name = $state('');
  let includeSecrets = $state(false);
  let notice = $state('');
  let noticeKind: 'ok' | 'error' = $state('ok');

  const kind = $derived(app.kind);
  const forKind = $derived(templates.filter((x) => x.kind === kind));
  const hasSecrets = $derived(secretKeys(kind).length > 0);

  // Stored templates are read only when the panel is opened.
  $effect(() => {
    if (open) void listTemplates().then((list) => (templates = list));
  });
  $effect(() => {
    // Keep the selection valid for the current kind.
    if (!forKind.some((x) => x.id === selected)) selected = forKind[0]?.id ?? '';
  });

  function flash(msg: string, k: typeof noticeKind = 'ok') {
    notice = msg;
    noticeKind = k;
    setTimeout(() => {
      if (notice === msg) notice = '';
    }, 2500);
  }

  function apply() {
    const tpl = forKind.find((x) => x.id === selected);
    if (!tpl) return;
    app.fields[kind] = restoreFields(kind, tpl.fields);
    flash(t('template.applied', { name: tpl.name }));
  }

  async function remove() {
    const tpl = forKind.find((x) => x.id === selected);
    if (!tpl || !confirm(t('template.deleteConfirm', { name: tpl.name }))) return;
    await deleteTemplate(tpl.id);
    templates = templates.filter((x) => x.id !== tpl.id);
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const tpl = await saveTemplate(name, kind, $state.snapshot(app.fields[kind]) as FormValues, includeSecrets);
      templates = [tpl, ...templates];
      selected = tpl.id;
      name = '';
      includeSecrets = false;
      flash(t('template.saved'));
    } catch (err) {
      flash(err instanceof RangeError ? t('template.full', { max: formatNumber(TEMPLATE_LIMIT) }) : t('template.saveFailed'), 'error');
    }
  }
</script>

<details class="templates" bind:open>
  <summary>{t('template.title')}</summary>
  <div class="stack body">
    {#if forKind.length}
      <div class="row">
        <label class="field grow">
          <span>{t('template.list', { kind: t(`kind.${kind}`) })}</span>
          <select bind:value={selected}>
            {#each forKind as tpl (tpl.id)}<option value={tpl.id}>{tpl.name}</option>{/each}
          </select>
        </label>
        <button type="button" class="btn small primary" onclick={apply}>{t('template.apply')}</button>
        <button type="button" class="btn small danger" onclick={remove}>{t('template.delete')}</button>
      </div>
    {:else}
      <p class="muted">{t('template.empty', { kind: t(`kind.${kind}`) })}</p>
    {/if}

    <form class="stack" onsubmit={save}>
      <div class="row">
        <label class="field grow">
          <span>{t('template.name')}</span>
          <input type="text" maxlength={TEMPLATE_NAME_MAX} autocomplete="off" bind:value={name} />
        </label>
        <button type="submit" class="btn small" disabled={!name.trim()}>{t('template.save')}</button>
      </div>
      {#if hasSecrets}
        <label class="check">
          <input type="checkbox" bind:checked={includeSecrets} />
          {t('template.includeSecrets')}
        </label>
      {/if}
      <p class="muted">{t('template.privacy')}</p>
    </form>
    {#if notice}<p class="msg {noticeKind}" role="status">{notice}</p>{/if}
  </div>
</details>

<style>
  p {
    margin: 0;
  }
  .templates {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
    font-size: 13px;
  }
  .body {
    margin-top: 10px;
  }
  .row {
    align-items: flex-end;
  }
  .grow {
    flex: 1;
    min-width: 12em;
  }
</style>
