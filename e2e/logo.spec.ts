import { expect, test, type Page } from '@playwright/test';
import { openApp, preview } from './helpers.ts';

/** A 64×64 PNG: white background with a red square in the middle. */
async function logoPng(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d')!;
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#d00000';
    x.fillRect(16, 16, 32, 32);
    return c.toDataURL('image/png').split(',')[1];
  });
  return Buffer.from(b64, 'base64');
}

/** Alpha of the logo thumbnail's top-left pixel. */
const cornerAlpha = (page: Page) =>
  page.locator('img.thumb').evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const x = c.getContext('2d')!;
    x.drawImage(img, 0, 0);
    return x.getImageData(0, 0, 1, 1).data[3];
  });

test('logo: plain background made transparent, modules kept or cleared behind it', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'ロゴ画像', exact: true }).click();
  const png = await logoPng(page);
  await page.getByLabel(/^ロゴ画像（/).setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
  await expect.poll(() => cornerAlpha(page)).toBe(255);

  await page.getByLabel('ロゴの背景（四隅と同じ単色）を透明にする').check();
  await expect.poll(() => cornerAlpha(page)).toBe(0);

  // Cleared (default): a background square behind the logo. Over the modules: none.
  const svg = preview(page).locator('.symbol svg');
  await expect(svg.locator('rect')).toHaveCount(2);
  await page.getByLabel('ロゴの下のセルを空ける（推奨）').uncheck();
  await expect(svg.locator('rect')).toHaveCount(1);
  await expect(preview(page).getByText(/読み取りを確認しました/)).toBeVisible({ timeout: 20_000 });
});
