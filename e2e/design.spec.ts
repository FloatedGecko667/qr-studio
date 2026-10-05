import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { openApp, preview } from './helpers.ts';

test('design template, shapes and gradient; the scan check follows every change', async ({ page }) => {
  await openApp(page);
  const card = preview(page);
  await expect(card.getByText(/読み取りを確認しました/)).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'ドット を適用' }).click();
  await expect(page.getByLabel('セルの形')).toHaveValue('dot');
  await expect(page.getByLabel('位置検出パターンの外枠')).toHaveValue('circle');
  await expect(card.getByText(/読み取りを確認しました/)).toBeVisible({ timeout: 20_000 });

  await page.getByRole('combobox', { name: '色', exact: true }).selectOption('linear');
  await expect(card.locator('.symbol svg linearGradient')).toHaveCount(1);
  await expect(card.getByText(/読み取りを確認しました/)).toBeVisible({ timeout: 20_000 });

  // The PDF keeps the gradient as a vector shading.
  await card.getByLabel('形式').selectOption('pdf');
  const download = page.waitForEvent('download');
  await card.getByRole('button', { name: '保存', exact: true }).click();
  const pdf = (await readFile((await (await download).path())!)).toString('latin1');
  expect(pdf).toContain('/ShadingType 2');
  expect(pdf).not.toContain('/Subtype /Image');
});

test('the automatic check flags a code that cannot be read', async ({ page }) => {
  await openApp(page);
  // Nearly white modules on white.
  await page.getByLabel('前景色').fill('#f4f4f4');
  await expect(preview(page).getByText(/読み取れませんでした。セルの形/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/コントラスト/).first()).toBeVisible();
});

test('colours that differ only in hue get their own warning', async ({ page }) => {
  await openApp(page);
  await page.getByLabel('前景色').fill('#d00000');
  await page.getByLabel('背景色').fill('#00a000');
  await expect(page.getByText(/色合いは違っても明るさが近い組み合わせです/)).toBeVisible();
  await expect(page.getByText('コントラストが不足しています。読み取れない可能性があります')).toHaveCount(0);
  // Darkening the foreground clears it.
  await page.getByLabel('前景色').fill('#200000');
  await expect(page.getByText(/色合いは違っても/)).toHaveCount(0);
});
