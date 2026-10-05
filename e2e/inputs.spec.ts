import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { openApp, openTab, preview } from './helpers.ts';

const kind = (page: Page, name: string) => page.getByRole('group', { name: '内容' }).getByRole('button', { name, exact: true }).click();

/** Saves the current QR as PNG and reads it back on the scan tab. */
async function readBack(page: Page): Promise<void> {
  const download = page.waitForEvent('download');
  await preview(page).getByRole('button', { name: '保存', exact: true }).click();
  const png = await readFile((await (await download).path())!);
  await openTab(page, '読取');
  await page.getByLabel('画像から読み取る').setInputFiles({ name: 'qr.png', mimeType: 'image/png', buffer: png });
}

test('URL: UTM parameters are added to the query and shown', async ({ page }) => {
  await openApp(page);
  await page.getByLabel('URL', { exact: true }).fill('https://example.com/p?x=1#top');
  await page.getByText('UTM パラメータ（アクセス解析用）').click();
  await page.getByLabel('参照元（utm_source）').fill('flyer');
  await page.getByLabel('メディア（utm_medium）').fill('qr');
  const expected = 'https://example.com/p?x=1&utm_source=flyer&utm_medium=qr#top';
  await expect(page.getByText(`コードに入る URL：${expected}`)).toBeVisible();
  await readBack(page);
  await expect(page.locator('pre')).toHaveText(expected, { timeout: 20_000 });
});

test('Wi-Fi: WPA3-only networks round-trip as T:SAE', async ({ page }) => {
  await openApp(page);
  await kind(page, 'Wi-Fi');
  await page.getByLabel('ネットワーク名（SSID）').fill('Home');
  await page.getByLabel('暗号化').selectOption({ label: 'WPA3 のみ（SAE）' });
  await page.getByLabel('パスワード', { exact: true }).fill('secret123');
  await readBack(page);
  await expect(page.locator('pre')).toHaveText('WIFI:T:SAE;S:Home;P:secret123;;', { timeout: 20_000 });
  await expect(page.getByText('WPA3 (SAE)')).toBeVisible();
});

test('event: a time zone turns the times into UTC', async ({ page }) => {
  await openApp(page);
  await kind(page, 'カレンダー');
  await page.getByLabel('タイトル').fill('Meeting');
  await page.getByLabel('開始').fill('2026-10-05T10:00');
  await page.getByLabel('タイムゾーン').selectOption('Asia/Tokyo');
  await readBack(page);
  await expect(page.locator('pre')).toContainText('DTSTART:20261005T010000Z', { timeout: 20_000 });
});
