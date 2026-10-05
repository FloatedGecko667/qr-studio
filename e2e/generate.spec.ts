import { readFile } from 'node:fs/promises';
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

  test('PDF: QR and barcode download as print-size PDFs', async ({ page }) => {
    await openApp(page);
    const card = preview(page);
    await card.getByRole('button', { name: 'mm' }).click();
    await card.getByLabel('形式').selectOption('pdf');
    let download = page.waitForEvent('download');
    await card.getByRole('button', { name: '保存', exact: true }).click();
    let file = await download;
    expect(file.suggestedFilename()).toMatch(/\.pdf$/);
    const pdf = (await readFile((await file.path())!)).toString('latin1');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    // 30 mm default = 85.0394 pt.
    expect(pdf).toContain('/MediaBox [0 0 85.0394 85.0394]');
    // Vector: the modules are paths, so a plain QR needs no embedded image.
    expect(pdf).not.toContain('/Subtype /Image');

    await switchMode(page, 'バーコード');
    await card.getByLabel('形式').selectOption('pdf');
    download = page.waitForEvent('download');
    await card.getByRole('button', { name: '保存', exact: true }).click();
    file = await download;
    expect(file.suggestedFilename()).toMatch(/\.pdf$/);
    // Bars are vectors; the human-readable digits come as one transparent overlay image (+ its alpha mask).
    expect((await readFile((await file.path())!)).toString('latin1').match(/\/Subtype \/Image/g)).toHaveLength(2);
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
    await switchMode(page, '2次元コード');
    await page.getByLabel('データ', { exact: true }).fill('E2E Data Matrix');
    const card = preview(page);
    await card.getByRole('button', { name: '検証する' }).click();
    await expect(card.getByText(/読み取れました/)).toBeVisible({ timeout: 20_000 });
  });

  for (const [type, value] of [
    ['PDF417', 'E2E PDF417 日本語 0123456789012345'],
    ['Aztec Code', 'E2E Aztec Code 日本語 0123456789'],
  ] as const) {
    test(`${type}: generates and verifies`, async ({ page }) => {
      await openApp(page);
      await switchMode(page, '2次元コード');
      await page.getByRole('combobox', { name: '種類', exact: true }).selectOption({ label: type });
      await page.getByLabel('データ', { exact: true }).fill(value);
      const card = preview(page);
      await expect(card.getByRole('img', { name: new RegExp(type) })).toBeVisible();
      await card.getByRole('button', { name: '検証する' }).click();
      await expect(card.getByText(/読み取れました/)).toBeVisible({ timeout: 20_000 });
    });
  }

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
