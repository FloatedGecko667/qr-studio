import { readFile } from 'node:fs/promises';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openApp, openTab, preview } from './helpers.ts';

/** Saves the current QR as PNG, then reads it back on the scan tab. */
async function generateAndScan(page: Page) {
  const download = page.waitForEvent('download');
  await preview(page).getByRole('button', { name: '保存', exact: true }).click();
  const png = await readFile((await (await download).path())!);
  await openTab(page, '読取');
  await page.getByLabel('画像から読み取る').setInputFiles({ name: 'qr.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('pre')).toBeVisible({ timeout: 20_000 });
}

const kind = (page: Page, name: string) => page.getByRole('group', { name: '内容' }).getByRole('button', { name, exact: true });
const actions = (page: Page) => page.getByRole('region', { name: /Wi-Fi|連絡先|予定|電話番号/ });

test('Wi-Fi: shows the network and copies the password', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openApp(page);
  await kind(page, 'Wi-Fi').click();
  await page.getByLabel('ネットワーク名（SSID）').fill('Office;5G');
  await page.getByLabel('パスワード').fill('s3cret:pw');
  await generateAndScan(page);

  const region = actions(page);
  await expect(region.getByRole('heading', { name: 'Wi-Fi' })).toBeVisible();
  await expect(region.getByText('Office;5G', { exact: true })).toBeVisible();
  await region.getByRole('button', { name: 'コピー: パスワード' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('s3cret:pw');
});

test('vCard: saves a .vcf and links the phone number', async ({ page }) => {
  await openApp(page);
  await kind(page, 'vCard').click();
  await page.getByLabel('姓', { exact: true }).fill('山田');
  await page.getByLabel('名', { exact: true }).fill('太郎');
  await page.getByLabel('電話番号').fill('090-1234-5678');
  await generateAndScan(page);

  const region = actions(page);
  await expect(region.getByRole('heading', { name: '連絡先' })).toBeVisible();
  await expect(region.getByRole('link', { name: '電話をかける' })).toHaveAttribute('href', 'tel:09012345678');
  const download = page.waitForEvent('download');
  await region.getByRole('button', { name: '連絡先を保存（.vcf）' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('太郎 山田.vcf');
  const vcf = await readFile((await file.path())!, 'utf8');
  expect(vcf).toMatch(/^BEGIN:VCARD\r\nVERSION:3\.0\r\n/);
  expect(vcf).toContain('TEL:090-1234-5678\r\n');

  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
});

test('event: saves a complete .ics file', async ({ page }) => {
  await openApp(page);
  await kind(page, 'カレンダー').click();
  await page.getByLabel('タイトル').fill('定例会議');
  await page.getByLabel('開始').fill('2026-10-01T10:00');
  await generateAndScan(page);

  const region = actions(page);
  await expect(region.getByRole('heading', { name: '予定' })).toBeVisible();
  const download = page.waitForEvent('download');
  await region.getByRole('button', { name: 'カレンダーに追加（.ics）' }).click();
  const ics = await readFile((await (await download).path())!, 'utf8');
  expect(ics).toContain('BEGIN:VCALENDAR\r\n');
  expect(ics).toMatch(/\r\nUID:[^\r]+@qr-studio\r\nDTSTAMP:\d{8}T\d{6}Z\r\n/);
  expect(ics).toContain('SUMMARY:定例会議\r\nDTSTART:20261001T100000\r\n');
});

test('phone: offers a call link built from the validated number', async ({ page }) => {
  await openApp(page);
  await kind(page, '電話').click();
  await page.getByLabel('電話番号').fill('+81-3-1234-5678');
  await generateAndScan(page);
  await expect(actions(page).getByRole('link', { name: '電話をかける' })).toHaveAttribute('href', 'tel:+81312345678');
});
