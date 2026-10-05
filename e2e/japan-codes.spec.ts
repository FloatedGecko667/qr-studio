import { expect, test, type Page } from '@playwright/test';
import { openApp, preview, switchMode } from './helpers.ts';

const chooseType = (page: Page, label: string) => page.getByRole('combobox', { name: 'バーコードの種類' }).selectOption({ label });

test('書籍JAN: two EAN-13 rows with captions, both read back', async ({ page }) => {
  await openApp(page);
  await switchMode(page, 'バーコード');
  await chooseType(page, '書籍JAN / Book JAN');
  const card = preview(page);
  const svg = card.locator('.symbol svg');
  await expect(svg).toContainText('ISBN978-4-7741-9999-3');
  await expect(svg).toContainText('C3055 ¥2980E');
  await card.getByRole('button', { name: '検証する' }).click();
  await expect(card.getByText(/読み取れました/)).toBeVisible({ timeout: 20_000 });
  // Print sizes use the retail magnifications.
  await expect(page.getByRole('region', { name: '印刷サイズ' }).getByRole('button', { name: /0\.33 mm/ })).toBeVisible();
});

test('郵便カスタマバーコード: extracts the address number; no scan check', async ({ page }) => {
  await openApp(page);
  await switchMode(page, 'バーコード');
  await chooseType(page, '郵便カスタマ / Japan Post');
  const card = preview(page);
  await expect(card.getByText('符号化した内容：1000013 1-3-2')).toBeVisible();
  await page.getByLabel('データ', { exact: true }).fill('263-0023 千葉市稲毛区緑町3丁目30-8 郵便ビル403号');
  await expect(card.getByText('符号化した内容：2630023 3-30-8-403')).toBeVisible();
  await expect(card.getByText('この種類は読取検証に対応していません')).toBeVisible();
  await expect(page.getByRole('region', { name: '印刷サイズ' }).getByRole('button', { name: /0\.6 mm/ })).toBeVisible();
});
