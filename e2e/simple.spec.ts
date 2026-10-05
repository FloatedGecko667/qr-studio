import { readFile } from 'node:fs/promises';
import { expect, test, type Download } from '@playwright/test';
import { openApp, preview, switchMode } from './helpers.ts';

/** Width and height from a PNG's IHDR chunk. */
async function pngSize(d: Download): Promise<{ w: number; h: number }> {
  const b = await readFile((await d.path())!);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

test('first visit: simple view, two steps from URL to a print-ready PNG', async ({ page }) => {
  await openApp(page, '/', 'simple');
  await expect(page.getByText('登録不要・透かしなし・期限切れなし・入力は端末の外に出ません')).toBeVisible();
  await expect(page.getByRole('group', { name: '表示' }).getByRole('button', { name: 'かんたん' })).toHaveAttribute('aria-pressed', 'true');
  // Only the essentials: no symbol options, design or capacity table.
  await expect(page.getByLabel('型番')).toHaveCount(0);
  await expect(page.getByRole('region', { name: '容量テーブル' })).toHaveCount(0);

  // Step 1: type the URL. Step 2: save.
  await page.getByLabel('URL', { exact: true }).fill('https://example.com/menu');
  const download = page.waitForEvent('download');
  await preview(page).getByRole('button', { name: '保存（PNG）' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('qr-example.com-menu.png');
  const { w, h } = await pngSize(file);
  expect(w).toBeGreaterThanOrEqual(1000);
  expect(h).toBe(w);
});

test('switching to the detailed view shows every option and is remembered', async ({ page }) => {
  await openApp(page, '/', 'simple');
  await page.getByRole('group', { name: '表示' }).getByRole('button', { name: 'くわしく' }).click();
  await expect(page.getByLabel('型番')).toBeVisible();
  await expect(page.getByRole('region', { name: '容量テーブル' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('group', { name: '表示' }).getByRole('button', { name: 'くわしく' })).toHaveAttribute('aria-pressed', 'true');
});

test('barcode in the simple view also saves a large PNG', async ({ page }) => {
  await openApp(page, '/', 'simple');
  await switchMode(page, 'バーコード');
  await expect(page.getByRole('region', { name: '印刷サイズ' })).toHaveCount(0);
  const download = page.waitForEvent('download');
  await preview(page).getByRole('button', { name: '保存（PNG）' }).click();
  expect((await pngSize(await download)).w).toBeGreaterThanOrEqual(1000);
});

test('reading distance sets the output size in mm', async ({ page }) => {
  await openApp(page);
  const tile = page.getByRole('region', { name: '読み取り距離から大きさを決める' });
  await tile.getByLabel('読み取る距離（m）').fill('0.3');
  // Default QR (version 2, 25 modules + 4 quiet each side): 30 mm symbol, 39.6 mm with the quiet zone.
  await expect(tile.getByText('コード本体の幅 30 mm（余白を含む出力 39.6 mm）、1セル 1.20 mm')).toBeVisible();
  await tile.getByRole('button', { name: '出力を 39.6 mm にする' }).click();
  await expect(preview(page).getByLabel('幅（mm）')).toHaveValue('39.6');
});
