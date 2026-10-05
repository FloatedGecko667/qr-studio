import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Page } from '@playwright/test';
import { openApp, openTab, preview, switchMode } from './helpers.ts';

const text = async (d: Download) => (await readFile((await d.path())!)).toString('latin1');

async function choosePdf(page: Page) {
  await preview(page).getByLabel('形式').selectOption('pdf');
}

test('structured append: "save all" as PDF gives one file with a page per symbol', async ({ page }) => {
  await openApp(page);
  await choosePdf(page);
  await page.getByLabel('連結（分割数）').selectOption('3');
  const download = page.waitForEvent('download');
  await preview(page).getByRole('button', { name: 'すべて1つのPDFで保存（1ページに1つ）' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/-x3\.pdf$/);
  expect(await text(file)).toContain('/Count 3');
});

test('QR batch: PDF output can be combined into one file', async ({ page }) => {
  await openApp(page);
  await choosePdf(page);
  await openTab(page, '一括生成');
  await page.getByLabel('入力', { exact: true }).fill('https://example.com/1\nhttps://example.com/2\nhttps://example.com/3');
  await expect(page.getByLabel('1つのPDFにまとめる（1ページに1つ）')).toBeChecked();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDFを生成' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('qr-batch-3.pdf');
  expect(await text(file)).toContain('/Count 3');
  await expect(page.getByText('3件を生成しました（失敗 0 件）')).toBeVisible();
});

test('barcode batch: PDF as one file, or a ZIP when unticked', async ({ page }) => {
  await openApp(page);
  await switchMode(page, 'バーコード');
  await choosePdf(page);
  await openTab(page, '一括生成');
  await page.getByLabel('入力', { exact: true }).fill('ABC-1\nABC-2');
  let download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDFを生成' }).click();
  let file = await download;
  expect(file.suggestedFilename()).toMatch(/-batch-2\.pdf$/);
  expect(await text(file)).toContain('/Count 2');

  await page.getByLabel('1つのPDFにまとめる（1ページに1つ）').uncheck();
  download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ZIPを生成' }).click();
  file = await download;
  expect(file.suggestedFilename()).toMatch(/\.zip$/);
});
