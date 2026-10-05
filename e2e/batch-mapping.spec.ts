import { readFile } from 'node:fs/promises';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { openApp, openTab } from './helpers.ts';

const CSV = ['ネットワーク名,パスワード,暗号化,ファイル名', 'Office,s3cret,WPA2,office', 'Guest,,なし,guest', ',,,', 'Lobby,pw,WPA3,'].join('\n');

test('CSV columns fill the Wi-Fi form, one code per row', async ({ page }) => {
  await openApp(page);
  await openTab(page, '一括生成');
  await page.getByRole('group', { name: '入力形式' }).getByRole('button', { name: 'CSV' }).click();
  await page.getByLabel('入力の種類').selectOption('wifi');
  await page.getByLabel('入力', { exact: true }).fill(CSV);

  const mapping = page.getByRole('group', { name: '列の割り当て' });
  await expect(mapping.getByRole('combobox', { name: 'ネットワーク名（SSID）', exact: true })).toHaveValue('0');
  await expect(mapping.getByRole('combobox', { name: 'パスワード', exact: true })).toHaveValue('1');
  await expect(mapping.getByRole('combobox', { name: '暗号化', exact: true })).toHaveValue('2');
  await expect(mapping.getByRole('combobox', { name: 'ファイル名', exact: true })).toHaveValue('3');
  await expect(mapping.locator('pre')).toHaveText('WIFI:T:WPA;S:Office;P:s3cret;;');
  await expect(page.getByText('3 件', { exact: true })).toBeVisible();

  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ZIPを生成' }).click();
  const zip = unzipSync(await readFile((await (await download).path())!));
  expect(Object.keys(zip).sort()).toEqual(['guest.png', 'office.png', 'wifi-0003.png']);
  await expect(page.getByText('3件を生成しました（失敗 0 件）')).toBeVisible();
});

test('rows the form rejects are listed before generating', async ({ page }) => {
  await openApp(page);
  await openTab(page, '一括生成');
  await page.getByRole('group', { name: '入力形式' }).getByRole('button', { name: 'CSV' }).click();
  await page.getByLabel('入力の種類').selectOption('geo');
  await page.getByLabel('入力', { exact: true }).fill('lat,lng,name\n35.68,139.76,Tokyo\n95,0,bad');
  await expect(page.getByText('1 行に問題があります（生成時には飛ばします）')).toBeVisible();
  await expect(page.getByText('3行目: 緯度は -90〜90 で入力してください')).toBeVisible();
  // Choosing a column by hand overrides the guess.
  const mapping = page.getByRole('group', { name: '列の割り当て' });
  await mapping.getByRole('combobox', { name: '経度', exact: true }).selectOption({ label: 'lat' });
  await expect(mapping.getByRole('combobox', { name: '経度', exact: true })).toHaveValue('0');
});
