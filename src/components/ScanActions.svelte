<script lang="ts">
  import { copyText, downloadBlob } from '../lib/export/download';
  import { localeTag, t } from '../lib/i18n/index.svelte';
  import { AI_NAMES, gs1Date } from '../lib/payload/gs1';
  import { eventToIcs, icalToDate, links, parseScanned } from '../lib/payload/parse';
  import { urlSafety } from '../lib/payload/urlSafety';
  import { newId } from '../lib/storage/records';

  /** Decoded text of a scan. Actions are offered for the recognised format; nothing opens by itself. */
  let { text }: { text: string } = $props();

  const scanned = $derived(parseScanned(text));
  let copiedKey = $state('');

  async function copyField(key: string, value: string) {
    try {
      await copyText(value);
      copiedKey = key;
      setTimeout(() => {
        if (copiedKey === key) copiedKey = '';
      }, 2000);
    } catch {
      copiedKey = '';
    }
  }

  function saveVcard(vcard: string, name: string) {
    downloadBlob(new Blob([vcard], { type: 'text/vcard' }), `${fileBase(name, 'contact')}.vcf`);
  }

  function saveIcs() {
    if (scanned.kind !== 'event') return;
    const ics = eventToIcs(scanned.event, `${newId()}@qr-studio`, new Date());
    downloadBlob(new Blob([ics], { type: 'text/calendar' }), `${fileBase(scanned.event.summary, 'event')}.ics`);
  }

  function fileBase(name: string, fallback: string): string {
    // oxlint-disable-next-line no-control-regex -- control characters are invalid in file names
    return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 60) || fallback;
  }

  function when(value: string): string {
    const d = icalToDate(value);
    if (!d) return value;
    const locale = localeTag();
    return d.allDay
      ? d.date.toLocaleDateString(locale, { dateStyle: 'medium' })
      : d.date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  }

  const isWeb = (url: string) => /^https?:\/\/\S+$/i.test(url);
</script>

<!-- Where a link really goes, with warning signs, shown next to every "Open". -->
{#snippet destination(url: string)}
  {@const s = urlSafety(url)}
  {#if s}
    <div class="dest" class:warn={s.warnings.length > 0}>
      <p>{t('urlSafety.host')}: <strong class="host">{s.host}</strong></p>
      {#if s.unicodeHost}<p>{t('urlSafety.unicode', { name: s.unicodeHost })}</p>{/if}
      {#if s.warnings.length}
        <ul>
          {#each s.warnings as w (w)}
            <li>{w === 'userinfo' ? t('urlSafety.userinfo', { user: s.userinfo, host: s.host }) : t(`urlSafety.${w}`)}</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet item(key: string, label: string, value: string)}
  {#if value}
    <div class="item">
      <dt>{label}</dt>
      <dd>
        <span class="value">{value}</span>
        <button type="button" class="btn small" onclick={() => copyField(key, value)} aria-label={`${t('scanAction.copy')}: ${label}`}>
          {copiedKey === key ? t('output.copied') : t('scanAction.copy')}
        </button>
      </dd>
    </div>
  {/if}
{/snippet}

{#if scanned.kind === 'url'}
  {@render destination(scanned.url)}
  <div class="row">
    <a class="btn small" href={scanned.url} target="_blank" rel="noopener noreferrer">{t('scan.open')}</a>
  </div>
  {#if scanned.gs1}
    <section class="actions stack" aria-labelledby="scan-gs1">
      <h3 id="scan-gs1">{t('scanAction.gs1')}</h3>
      <dl>
        {#each scanned.gs1 as [ai, value], i (i)}
          {@render item(`gs1-${i}`, `(${ai}) ${AI_NAMES.has(ai) ? t(`gs1ai.${ai}`) : t('gs1ai.other', { ai })}`, gs1Date(ai, value) ?? value)}
        {/each}
      </dl>
    </section>
  {/if}
{:else if scanned.kind !== 'text'}
  <section class="actions stack" aria-labelledby="scan-kind">
    <h3 id="scan-kind">{t(`scanAction.kind.${scanned.kind}`)}</h3>
    <dl>
      {#if scanned.kind === 'wifi'}
        {@render item('ssid', t('field.ssid'), scanned.ssid)}
        {@render item('auth', t('field.auth'), scanned.auth === 'nopass' ? t('scanAction.noPassword') : scanned.auth === 'SAE' ? 'WPA3 (SAE)' : scanned.auth)}
        {@render item('password', t('field.password'), scanned.password)}
        {#if scanned.hidden}{@render item('hidden', t('field.hidden'), t('scanAction.yes'))}{/if}
      {:else if scanned.kind === 'contact'}
        {@const c = scanned.contact}
        {@render item('name', t('scanAction.name'), c.name)}
        {@render item('org', t('field.org'), c.org)}
        {@render item('title', t('field.jobTitle'), c.title)}
        {#each c.tels as tel, i (i)}{@render item(`tel${i}`, t('field.tel'), tel)}{/each}
        {#each c.emails as mail, i (i)}{@render item(`mail${i}`, t('field.email'), mail)}{/each}
        {@render item('url', t('field.url'), c.url)}
        {@render item('address', t('field.address'), c.address)}
        {@render item('note', t('field.note'), c.note)}
      {:else if scanned.kind === 'event'}
        {@const ev = scanned.event}
        {@render item('summary', t('field.summary'), ev.summary)}
        {@render item('start', t('field.start'), when(ev.start))}
        {@render item('end', t('field.end'), when(ev.end))}
        {@render item('location', t('scanAction.location'), ev.location)}
        {@render item('description', t('scanAction.description'), ev.description)}
      {:else if scanned.kind === 'tel'}
        {@render item('tel', t('field.tel'), scanned.number)}
      {:else if scanned.kind === 'sms'}
        {@render item('tel', t('field.tel'), scanned.number)}
        {@render item('message', t('field.message'), scanned.message)}
      {:else if scanned.kind === 'email'}
        {@render item('to', t('field.to'), scanned.to)}
        {@render item('subject', t('field.subject'), scanned.subject)}
        {@render item('body', t('field.body'), scanned.body)}
      {:else if scanned.kind === 'geo'}
        {@render item('latlng', `${t('field.lat')} / ${t('field.lng')}`, `${scanned.lat}, ${scanned.lng}`)}
        {@render item('label', t('field.placeLabel'), scanned.label)}
      {/if}
    </dl>

    <div class="row">
      {#if scanned.kind === 'wifi'}
        <p class="muted">{t('scanAction.wifiHint')}</p>
      {:else if scanned.kind === 'contact'}
        {@const c = scanned.contact}
        <button type="button" class="btn small primary" onclick={() => saveVcard(scanned.vcard, c.name || c.org)}>{t('scanAction.saveContact')}</button>
        {#if c.tels[0]}<a class="btn small" href={links.tel(c.tels[0])}>{t('scanAction.call')}</a>{/if}
        {#if c.emails[0]}<a class="btn small" href={links.mail(c.emails[0], '', '')}>{t('scanAction.mail')}</a>{/if}
        {#if isWeb(c.url)}<a class="btn small" href={c.url} target="_blank" rel="noopener noreferrer">{t('scan.open')}</a>{/if}
      {:else if scanned.kind === 'event'}
        <button type="button" class="btn small primary" onclick={saveIcs}>{t('scanAction.saveEvent')}</button>
      {:else if scanned.kind === 'tel'}
        <a class="btn small primary" href={links.tel(scanned.number)}>{t('scanAction.call')}</a>
      {:else if scanned.kind === 'sms'}
        <a class="btn small primary" href={links.sms(scanned.number, scanned.message)}>{t('scanAction.sms')}</a>
      {:else if scanned.kind === 'email'}
        <a class="btn small primary" href={links.mail(scanned.to, scanned.subject, scanned.body)}>{t('scanAction.mail')}</a>
      {:else if scanned.kind === 'geo'}
        <a class="btn small primary" href={links.osm(scanned.lat, scanned.lng)} target="_blank" rel="noopener noreferrer">{t('scanAction.openMap')}</a>
        <a class="btn small" href={links.geo(scanned.lat, scanned.lng)}>{t('scanAction.openMapApp')}</a>
      {/if}
    </div>
    {#if scanned.kind === 'contact' && isWeb(scanned.contact.url)}{@render destination(scanned.contact.url)}{/if}
  </section>
{/if}

<style>
  p {
    margin: 0;
  }
  .dest {
    display: grid;
    gap: 4px;
    margin-bottom: 8px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .dest.warn {
    border-color: var(--warn);
    background: var(--warn-bg);
  }
  .dest ul {
    margin: 0;
    padding-left: 1.2em;
    color: var(--warn);
  }
  .host {
    font-size: 15px;
  }
  .actions {
    border-top: 1px solid var(--border);
    padding-top: 12px;
  }
  dl {
    display: grid;
    gap: 6px;
    margin: 0;
  }
  .item {
    display: grid;
    grid-template-columns: minmax(6em, max-content) minmax(0, 1fr);
    gap: 4px 12px;
    align-items: center;
  }
  dt {
    font-size: 12px;
    color: var(--text-2);
    font-weight: 600;
  }
  dd {
    margin: 0;
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
  }
  .value {
    flex: 1;
    min-width: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  @media (max-width: 480px) {
    .item {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
