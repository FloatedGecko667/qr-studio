import { expect, test, type Page } from '@playwright/test';

// Screenshot comparisons. English keeps every glyph in the bundled JetBrains Mono, so the
// baselines do not depend on the system's Japanese fonts. Baselines are per platform
// (e2e/__screenshots__); update them with `npx playwright test --project=visual --update-snapshots`.

const TEMPLATES = [
  'Classic',
  'Dots',
  'Rounded',
  'Night sky',
  'Ocean',
  'Forest',
  'Crimson',
  'Columns',
  'Rows',
  'Diamonds',
  'SCAN ME',
  'SCAN ME (blue)',
  'MENU',
] as const;

async function open(page: Page, view: 'simple' | 'detailed' = 'detailed') {
  await page.addInitScript((v) => {
    if (!localStorage.getItem('qr-studio:settings')) localStorage.setItem('qr-studio:settings', JSON.stringify({ view: v, locale: 'en' }));
  }, view);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

const card = (page: Page) => page.getByRole('region', { name: 'Preview' });

async function scanChecked(page: Page) {
  await expect(card(page).getByText(/Scan checked/)).toBeVisible({ timeout: 20_000 });
}

test.describe('design templates', () => {
  for (const name of TEMPLATES) {
    test(name, async ({ page }) => {
      await open(page);
      await page.getByRole('button', { name: `Apply ${name}`, exact: true }).click();
      await scanChecked(page);
      await expect(card(page).locator('.symbol')).toHaveScreenshot(`template-${name.replace(/\W+/g, '-').replace(/-$/, '').toLowerCase()}.png`);
    });
  }
});

test.describe('screens', () => {
  test('generate (detailed)', async ({ page }) => {
    await open(page);
    await scanChecked(page);
    await expect(page).toHaveScreenshot('generate-detailed.png');
  });

  test('generate (simple)', async ({ page }) => {
    await open(page, 'simple');
    await scanChecked(page);
    await expect(page).toHaveScreenshot('generate-simple.png');
  });

  test('barcode', async ({ page }) => {
    await open(page);
    await page.getByRole('group', { name: 'Code type' }).getByRole('button', { name: 'Barcode' }).click();
    await expect(card(page).getByRole('img')).toBeVisible();
    await expect(page).toHaveScreenshot('barcode.png');
  });

  test('scan', async ({ page }) => {
    await open(page);
    await page.getByRole('navigation').getByRole('button', { name: 'Scan', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Scan', exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('scan.png');
  });
});
