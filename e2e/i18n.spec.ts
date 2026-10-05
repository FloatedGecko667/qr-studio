import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openApp } from './helpers.ts';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// The "Preview" heading in each language, as a quick check that the dictionary arrived.
const LANGS = [
  { locale: 'zh-Hans', preview: '预览' },
  { locale: 'zh-Hant', preview: '預覽' },
  { locale: 'fr', preview: 'Aperçu' },
  { locale: 'de', preview: 'Vorschau' },
  { locale: 'es', preview: 'Vista previa' },
  { locale: 'pt', preview: 'Prévia' },
  { locale: 'it', preview: 'Anteprima' },
] as const;

for (const { locale, preview } of LANGS) {
  test(`${locale}: switching language translates the page and passes axe`, async ({ page }) => {
    await openApp(page);
    await page.locator('summary[aria-label="表示設定"]').click();
    await page.getByLabel('言語').selectOption(locale);
    await expect(page.getByRole('heading', { name: preview })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    // Only the chosen dictionary is fetched, not every language.
    const scripts = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));
    expect(scripts.filter((s) => /\/(fr|de|es|pt|it|zh-Han[st])-[\w-]+\.js$/.test(s)).length).toBe(1);

    await page.keyboard.press('Escape');
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ') + ' ' + n.failureSummary).join(' | ')}`)).toEqual([]);

    await page.reload();
    await expect(page.getByRole('heading', { name: preview })).toBeVisible();
  });
}

test.describe('browser language', () => {
  for (const [browserLocale, preview] of [
    ['de-DE', 'Vorschau'],
    ['zh-TW', '預覽'],
    ['ko-KR', 'Preview'],
  ] as const) {
    test.describe(browserLocale, () => {
      test.use({ locale: browserLocale });
      test(`a first visit in ${browserLocale} picks the matching language`, async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { name: preview })).toBeVisible();
      });
    });
  }
});

test('Chinese pages use Chinese system fonts', async ({ page }) => {
  await openApp(page);
  await page.locator('summary[aria-label="表示設定"]').click();
  await page.getByLabel('言語').selectOption('zh-Hans');
  await expect(page.getByRole('heading', { name: '预览' })).toBeVisible();
  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(font).toContain('PingFang SC');
  expect(font).not.toContain('Hiragino');
});
