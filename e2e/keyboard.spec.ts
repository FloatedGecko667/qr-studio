import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers.ts';

const isMac = (page: Page) => page.evaluate(() => /mac|iphone|ipad/i.test(navigator.platform));

test('⌘S / Ctrl+S saves, also while typing in the URL field', async ({ page }) => {
  await openApp(page);
  await page.getByLabel('URL', { exact: true }).fill('https://example.com/keys');
  const download = page.waitForEvent('download');
  await page.keyboard.press((await isMac(page)) ? 'Meta+s' : 'Control+s');
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
});

test('Alt+Shift shortcuts switch tabs and modes and open the list', async ({ page }) => {
  await openApp(page);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Alt+Shift+Digit3');
  await expect(page.getByRole('navigation').getByRole('button', { name: '読取', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Alt+Shift+Digit1');
  await page.keyboard.press('Alt+Shift+KeyB');
  await expect(page.getByRole('group', { name: 'コードの種類' }).getByRole('button', { name: 'バーコード' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Alt+Shift+KeyQ');
  await expect(page.getByRole('group', { name: 'コードの種類' }).getByRole('button', { name: 'QRコード' })).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('Alt+Shift+Slash');
  const dialog = page.getByRole('dialog', { name: 'キーボードショートカット' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('rowheader')).toHaveCount(8);
  const { violations } = await new AxeBuilder({ page }).include('dialog').withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('shortcut keys do nothing while typing (except save)', async ({ page }) => {
  await openApp(page);
  const url = page.getByLabel('URL', { exact: true });
  await url.focus();
  await page.keyboard.press('Alt+Shift+Digit3');
  await expect(page.getByRole('navigation').getByRole('button', { name: '生成', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('the footer link opens the shortcut list', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'キーボードショートカット' }).click();
  await expect(page.getByRole('dialog', { name: 'キーボードショートカット' })).toBeVisible();
});
