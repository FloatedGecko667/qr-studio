import { expect, test } from '@playwright/test';
import { openApp, preview, switchMode } from './helpers.ts';

for (const mode of ['QRコード', 'バーコード', '2次元コード'] as const) {
  test(`${mode}: the preview stays reachable while scrolling`, async ({ page, isMobile }) => {
    await openApp(page);
    await switchMode(page, mode);
    await expect(preview(page)).toBeVisible();
    await page.mouse.wheel(0, 4000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    const dock = page.getByRole('button', { name: 'プレビューに戻る' });
    if (isMobile) {
      // Single column: the preview scrolls away and a compact copy docks under the ribbon.
      await expect(dock).toBeVisible();
      await dock.click();
      await expect(preview(page).locator('.canvas')).toBeInViewport();
      await expect(dock).toBeHidden();
    } else {
      // Two columns: the preview follows the page, and there is no dock.
      await expect(preview(page).locator('.canvas')).toBeInViewport();
      await expect(dock).toHaveCount(0);
    }
  });
}

test('no horizontal page scroll', async ({ page }) => {
  await openApp(page);
  for (const mode of ['QRコード', 'バーコード', '2次元コード'] as const) {
    await switchMode(page, mode);
    await expect(preview(page)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, mode).toBeLessThanOrEqual(0);
  }
});
