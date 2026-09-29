import { expect, test } from '@playwright/test';

test('app shortcut URLs open the screen and then clear the parameters', async ({ page }) => {
  await page.goto('/?mode=barcode&tab=scan');
  await expect(page.getByRole('group', { name: 'コードの種類' }).getByRole('button', { name: 'バーコード' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('navigation').getByRole('button', { name: '読取', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: '読取', exact: true })).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
});

test('unknown shortcut values fall back to the generator', async ({ page }) => {
  await page.goto('/?mode=nope&tab=<x>');
  await expect(page.getByRole('heading', { name: 'プレビュー' })).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
});

test('the manifest lists the shortcuts', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.shortcuts.map((s: { url: string }) => s.url)).toEqual([
    '/?mode=qr&tab=generate',
    '/?mode=barcode&tab=generate',
    '/?mode=datamatrix&tab=generate',
    '/?tab=scan',
  ]);
});
