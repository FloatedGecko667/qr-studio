import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { openApp, openTab, preview } from './helpers.ts';

/** Generates a QR for `url` on the generate tab and returns the downloaded PNG. */
async function qrPng(page: Page, url: string): Promise<Buffer> {
  await openTab(page, '生成');
  await page.getByLabel('URL', { exact: true }).fill(url);
  const download = page.waitForEvent('download');
  await preview(page).getByRole('button', { name: '保存', exact: true }).click();
  return readFile((await (await download).path())!);
}

async function scanFile(page: Page, png: Buffer) {
  await page.getByLabel('画像から読み取る').setInputFiles({ name: 'qr.png', mimeType: 'image/png', buffer: png });
}

const log = (page: Page) => page.getByRole('region', { name: '読取履歴' });
const rows = (page: Page) => log(page).getByRole('listitem');

test('logs file scans, counts repeats, exports CSV and survives a reload', async ({ page }) => {
  await openApp(page);
  const a = await qrPng(page, 'https://example.com/a');
  const b = await qrPng(page, 'https://example.com/b');
  await openTab(page, '読取');
  await expect(log(page).getByText('読み取った内容はここに記録されます', { exact: false })).toBeVisible();

  await log(page).getByRole('button', { name: '同じ内容は回数をまとめる' }).click();
  await scanFile(page, a);
  await expect(rows(page)).toHaveCount(1);
  await scanFile(page, b);
  await expect(rows(page)).toHaveCount(2);
  // The same file again after the cooldown is counted on the existing row.
  await page.waitForTimeout(2100);
  await scanFile(page, a);
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).first()).toContainText('https://example.com/a');
  await expect(rows(page).first()).toContainText('×2');

  const download = page.waitForEvent('download');
  await log(page).getByRole('button', { name: 'CSVで書き出す' }).click();
  const csv = await readFile((await (await download).path())!, 'utf8');
  expect(csv.startsWith('﻿日時,形式,内容,回数\r\n')).toBe(true);
  expect(csv).toMatch(/,QRCode,https:\/\/example\.com\/b,1\r\n.*,QRCode,https:\/\/example\.com\/a,2\r\n$/s);

  await page.reload();
  await openTab(page, '読取');
  await expect(rows(page)).toHaveCount(2);

  page.once('dialog', (d) => d.accept());
  await log(page).getByRole('button', { name: 'すべて削除' }).click();
  await expect(rows(page)).toHaveCount(0);
  await page.reload();
  await openTab(page, '読取');
  await expect(rows(page)).toHaveCount(0);
});

test('continuous scan keeps the camera on and logs each new code once', async ({ page }) => {
  await openApp(page);
  const a = (await qrPng(page, 'https://example.com/cam-a')).toString('base64');
  const b = (await qrPng(page, 'https://example.com/cam-b')).toString('base64');

  // Fake camera: a canvas stream showing whichever image the test sets.
  await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d')!;
    const w = window as unknown as { setFrame: (src: string) => Promise<void> };
    w.setFrame = async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 640, 480);
      ctx.drawImage(img, 170, 90, 300, 300);
    };
    setInterval(() => ctx.fillRect(0, 0, 1, 1), 100);
    navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(10);
  });
  const show = (b64: string) => page.evaluate((s) => (window as unknown as { setFrame: (s: string) => Promise<void> }).setFrame(s), `data:image/png;base64,${b64}`);

  await openTab(page, '読取');
  await page.getByLabel('連続スキャン').check();
  await show(a);
  await page.getByRole('button', { name: 'カメラで読み取る' }).click();
  await expect(rows(page)).toHaveCount(1, { timeout: 10_000 });
  // Held in view: still one row, and the camera is still running.
  await page.waitForTimeout(1500);
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'カメラを止める' })).toBeVisible();

  await show(b);
  await expect(rows(page)).toHaveCount(2, { timeout: 10_000 });
  await expect(rows(page).first()).toContainText('https://example.com/cam-b');
  await page.getByRole('button', { name: 'カメラを止める' }).click();
});
