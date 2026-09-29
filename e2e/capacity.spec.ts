import { expect, test, type Page } from '@playwright/test';
import { openApp, preview, switchMode } from './helpers.ts';

const table = (page: Page) => page.getByRole('region', { name: '容量テーブル' });
const chooseType = (page: Page, label: string) => page.getByRole('combobox', { name: '種類', exact: true }).selectOption({ label });

test('Data Matrix: picking a row fixes the size, and auto restores it', async ({ page }) => {
  await openApp(page);
  await switchMode(page, '2次元コード');
  await expect(table(page).getByRole('row', { name: /22 × 22/ })).toContainText('収まる最小');
  await table(page).getByRole('button', { name: /32 × 32/ }).click();
  await expect(preview(page).getByText(/32 × 32/)).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'サイズ' })).toHaveValue('32x32');
  await table(page).getByRole('button', { name: '自動に戻す' }).click();
  await expect(page.getByRole('combobox', { name: 'サイズ' })).toHaveValue('auto');
  await expect(preview(page).getByText(/22 × 22/)).toBeVisible();
});

test('Aztec: rows follow the error correction and pick a fixed layer count', async ({ page }) => {
  await openApp(page);
  await switchMode(page, '2次元コード');
  await chooseType(page, 'Aztec Code');
  await expect(table(page).getByRole('row', { name: /Compact 2/ })).toContainText('収まる最小');
  await table(page).getByRole('button', { name: /Full 5/ }).click();
  await expect(preview(page).getByText(/Full 5L 37×37/)).toBeVisible();
  // The fixed symbol still reads back.
  await preview(page).getByRole('button', { name: '検証する' }).click();
  await expect(preview(page).getByText(/読み取れました/)).toBeVisible({ timeout: 20_000 });
});

test('PDF417: picking a level fixes the error correction level', async ({ page }) => {
  await openApp(page);
  await switchMode(page, '2次元コード');
  await chooseType(page, 'PDF417');
  await table(page).getByRole('button', { name: /^.*5（64）/ }).click();
  await expect(page.getByRole('combobox', { name: '誤り訂正レベル' })).toHaveValue('5');
  await expect(preview(page).getByText(/EC5/)).toBeVisible();
});

test('linear barcode: print size rows set the X dimension in mm', async ({ page }) => {
  await openApp(page);
  await switchMode(page, 'バーコード');
  const tile = page.getByRole('region', { name: '印刷サイズ' });
  await expect(tile.getByText('全体 198（バー部分 178、残りは余白）')).toBeVisible();
  await tile.getByRole('button', { name: 'X寸法を 0.5 mm にする' }).click();
  await expect(tile.getByText('99.0 × 35.5 mm（X = 0.5 mm）')).toBeVisible();
  await expect(tile.getByRole('row', { name: /0.5 mm/ })).toHaveAttribute('aria-current', 'true');
});
