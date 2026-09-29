<script lang="ts">
  import { app, MAX_BINARY_BYTES } from '../lib/app.svelte';
  import { formatNumber, t } from '../lib/i18n/index.svelte';
  import { PAYLOAD_KINDS } from '../lib/payload';
  import { FORMS, type FieldDef } from '../lib/payload/forms';
  import UsageMeter from './UsageMeter.svelte';
  import ImageInput from './ImageInput.svelte';
  import GeoInput from './GeoInput.svelte';
  import TemplatePicker from './TemplatePicker.svelte';
  import { TEMPLATE_KINDS_EXCLUDED } from '../lib/storage/templates';

  const form = $derived(FORMS[app.kind]);
  const values = $derived(app.fields[app.kind]);
  let fileError = $state('');

  function str(key: string): string {
    const v = values[key];
    return typeof v === 'string' ? v : '';
  }

  function inputType(f: FieldDef): string {
    if (f.type === 'datetime') return values.allDay === true ? 'date' : 'datetime-local';
    return f.type;
  }

  function dateValue(key: string): string {
    const v = str(key);
    return values.allDay === true ? v.slice(0, 10) : v;
  }

  async function onFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    fileError = '';
    if (!file) return;
    if (file.size > MAX_BINARY_BYTES) {
      fileError = t('field.fileTooLarge', { max: formatNumber(MAX_BINARY_BYTES) });
      app.setField('file', null);
      return;
    }
    app.setField('file', new Uint8Array(await file.arrayBuffer()));
  }

  const fileBytes = $derived(values.file instanceof Uint8Array ? values.file.length : 0);
</script>

<section class="card stack" aria-labelledby="content-heading">
  <h2 id="content-heading">{t('section.content')}</h2>
  <div class="kinds" role="group" aria-label={t('section.content')}>
    {#each PAYLOAD_KINDS as kind (kind)}
      <button
        type="button"
        aria-pressed={app.kind === kind}
        class:active={app.kind === kind}
        onclick={() => (app.kind = kind)}>{t(`kind.${kind}`)}</button>
    {/each}
  </div>

  {#if !TEMPLATE_KINDS_EXCLUDED.has(app.kind)}<TemplatePicker />{/if}
  {#if app.kind === 'image'}<ImageInput />{/if}
  {#if app.kind === 'geo'}<GeoInput />{/if}

  <div class="grid2">
    {#each form.fields as f (f.key)}
      {#if !f.showIf || f.showIf(values)}
        {#if f.type === 'checkbox'}
          <label class="check full">
            <input type="checkbox" checked={values[f.key] === true} onchange={(e) => app.setField(f.key, e.currentTarget.checked)} />
            {t(`field.${f.label}`)}
          </label>
        {:else if f.type === 'select'}
          <label class="field">
            <span>{t(`field.${f.label}`)}</span>
            <select value={str(f.key)} onchange={(e) => app.setField(f.key, e.currentTarget.value)}>
              {#each f.options ?? [] as o (o.value)}
                <option value={o.value}>{o.label.startsWith('option.') ? t(o.label) : o.label}</option>
              {/each}
            </select>
          </label>
        {:else if f.type === 'textarea'}
          <label class="field full">
            <span>{t(`field.${f.label}`)}</span>
            <textarea
              rows={f.rows ?? 3}
              placeholder={f.placeholder}
              value={str(f.key)}
              oninput={(e) => app.setField(f.key, e.currentTarget.value)}></textarea>
          </label>
        {:else if f.type === 'file'}
          <label class="field full">
            <span>{t(`field.${f.label}`)}</span>
            <input type="file" onchange={onFile} />
            {#if fileError}<span class="msg error" role="alert">{fileError}</span>
            {:else if fileBytes}<span class="muted">{t('field.fileSize', { size: formatNumber(fileBytes) })}</span>{/if}
          </label>
        {:else if f.type === 'datetime'}
          <label class="field">
            <span>{t(`field.${f.label}`)}</span>
            <input type={inputType(f)} value={dateValue(f.key)} oninput={(e) => app.setField(f.key, e.currentTarget.value)} />
          </label>
        {:else}
          <label class="field" class:full={f.type === 'url' || f.type === 'text'}>
            <span>{t(`field.${f.label}`)}</span>
            <input
              type={f.type === 'number' ? 'text' : f.type}
              inputmode={f.type === 'number' ? 'decimal' : undefined}
              autocomplete="off"
              spellcheck="false"
              placeholder={f.placeholder}
              value={str(f.key)}
              oninput={(e) => app.setField(f.key, e.currentTarget.value)} />
          </label>
        {/if}
      {/if}
    {/each}
  </div>

  <UsageMeter />

  {#each app.payload.errors as err (err)}
    <p class="msg error" role="alert">{t(err)}</p>
  {/each}
  {#each app.payload.warnings as w (w)}
    <p class="msg warn">{t(w)}</p>
  {/each}
</section>

<style>
  .kinds {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .kinds button {
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: 999px;
    padding: 4px 12px;
    min-height: 32px;
    cursor: pointer;
    font-size: 13px;
  }
  .kinds button.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
    font-weight: 600;
  }
  .full {
    grid-column: 1 / -1;
  }
  p {
    margin: 0;
  }
</style>
