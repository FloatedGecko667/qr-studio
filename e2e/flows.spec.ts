import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { openApp, openTab, preview, switchMode } from './helpers.ts';

test('scan: reads back a downloaded QR image', async ({ page }) => {
  await openApp(page);
  await page.getByLabel('URL', { exact: true }).fill('https://example.com/scan-e2e');
  const download = page.waitForEvent('download');
  await preview(page).getByRole('button', { name: '保存', exact: true }).click();
  const png = await readFile((await (await download).path())!);

  await openTab(page, '読取');
  await page.getByLabel('画像から読み取る').setInputFiles({ name: 'qr.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('pre')).toHaveText('https://example.com/scan-e2e', { timeout: 20_000 });
  await expect(page.getByRole('link', { name: '開く' })).toHaveAttribute('href', 'https://example.com/scan-e2e');
});

test('batch: builds a ZIP from lines', async ({ page }) => {
  await openApp(page);
  await openTab(page, '一括生成');
  await page.getByLabel('入力', { exact: true }).fill('https://example.com/1\nhttps://example.com/2\nhttps://example.com/3');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ZIPを生成' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.zip$/);
  await expect(page.getByText('3件を生成しました（失敗 0 件）')).toBeVisible();
});

test('history: saves and restores an entry', async ({ page }) => {
  await openApp(page);
  const url = page.getByLabel('URL', { exact: true });
  await url.fill('https://example.com/history-e2e');
  await preview(page).getByRole('button', { name: '履歴に保存' }).click();
  await expect(page.getByText('履歴に保存しました')).toBeVisible();
  await url.fill('https://example.com/changed');

  await openTab(page, '履歴');
  await expect(page.getByText('https://example.com/history-e2e')).toBeVisible();
  await page.getByRole('button', { name: '開く' }).first().click();
  await expect(page.getByLabel('URL', { exact: true })).toHaveValue('https://example.com/history-e2e');
});

for (const [type, value] of [
  ['PDF417', 'PDF417 scan 0123456789'],
  ['Aztec Code', 'Aztec scan 0123456789'],
] as const) {
  test(`scan: reads back a downloaded ${type} image`, async ({ page }) => {
    await openApp(page);
    await switchMode(page, '2次元コード');
    await page.getByRole('combobox', { name: '種類', exact: true }).selectOption({ label: type });
    await page.getByLabel('データ', { exact: true }).fill(value);
    const download = page.waitForEvent('download');
    await preview(page).getByRole('button', { name: '保存', exact: true }).click();
    const png = await readFile((await (await download).path())!);

    await openTab(page, '読取');
    await page.getByLabel('画像から読み取る').setInputFiles({ name: 'code.png', mimeType: 'image/png', buffer: png });
    await expect(page.locator('pre')).toHaveText(value, { timeout: 20_000 });
  });
}
