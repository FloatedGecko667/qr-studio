import { expect, test } from '@playwright/test';
import { openApp, preview, switchMode } from './helpers.ts';

test.describe('generate', () => {
  test('QR code: renders, verifies and downloads', async ({ page }) => {
    await openApp(page);
    await page.getByLabel('URL', { exact: true }).fill('https://example.com/e2e');
    const card = preview(page);
    await expect(card.getByRole('img', { name: 'QR 1/1' })).toBeVisible();
    await expect(card.getByText(/^2-M/)).toBeVisible();

    await card.getByRole('button', { name: '検証する' }).click();
    await expect(card.getByText(/読み取れました/)).toBeVisible({ timeout: 20_000 });

    const download = page.waitForEvent('download');
    await card.getByRole('button', { name: '保存', exact: true }).click();
    expect((await download).suggestedFilename()).toMatch(/^qr-.+\.png$/);
  });

  test('QR code: fixed version that is too small offers suggestions', async ({ page }) => {
    await openApp(page);
    await page.getByLabel('URL', { exact: true }).fill(`https://example.com/${'a'.repeat(200)}`);
    await page.getByLabel('型番').selectOption('1');
    await expect(preview(page).getByRole('alert')).toBeVisible();
  });

  test('barcode: Code 128 verifies', async ({ page }) => {
    await openApp(page);
    await switchMode(page, 'バーコード');
    await page.getByLabel('データ', { exact: true }).fill('E2E-128');
    const card = preview(page);
    await expect(card.getByRole('img', { name: /E2E-128/ })).toBeVisible();
    await card.getByRole('button', { name: '検証する' }).click();
    await expect(card.getByText(/読み取れました/)).toBeVisible({ timeout: 20_000 });
  });

  test('Data Matrix: verifies', async ({ page }) => {
    await openApp(page);
    await switchMode(page, 'Data Matrix');
    await page.getByLabel('データ', { exact: true }).fill('E2E Data Matrix');
    const card = preview(page);
    await card.getByRole('button', { name: '検証する' }).click();
    await expect(card.getByText(/読み取れました/)).toBeVisible({ timeout: 20_000 });
  });

  test('settings: theme and language persist across reloads', async ({ page }) => {
    await openApp(page);
    await page.locator('summary[aria-label="表示設定"]').click();
    await page.getByLabel('テーマ').selectOption('dark');
    await page.getByLabel('言語').selectOption('en');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible();
  });
});
