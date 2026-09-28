import { expect, test, type Page } from '@playwright/test';
import { openApp, preview, switchMode } from './helpers.ts';

/** Fakes the Web Share API: records shared file names; PDFs are "not accepted" by the target. */
async function mockShare(page: Page, firstError?: string) {
  await page.addInitScript((err) => {
    const w = window as unknown as { shared: string[][] };
    w.shared = [];
    let failNext = err;
    Object.assign(navigator, {
      canShare: (d: ShareData) => !!d.files?.every((f) => f.type !== 'application/pdf'),
      share: async (d: ShareData) => {
        if (failNext) {
          const e = new DOMException('no activation', failNext);
          failNext = undefined;
          throw e;
        }
        w.shared.push(d.files!.map((f) => `${f.name}:${f.type}`));
      },
    });
  }, firstError);
}

const shared = (page: Page) => page.evaluate(() => (window as unknown as { shared: string[][] }).shared);

test('shares the image in the chosen format', async ({ page }) => {
  await mockShare(page);
  await openApp(page);
  await preview(page).getByRole('button', { name: '共有' }).click();
  await expect.poll(() => shared(page)).toEqual([[expect.stringMatching(/^qr-.+\.png:image\/png$/)]]);
});

test('falls back to PNG when the target does not accept the format', async ({ page }) => {
  await mockShare(page);
  await openApp(page);
  await switchMode(page, 'バーコード');
  const card = preview(page);
  await card.getByLabel('形式').selectOption('pdf');
  await card.getByRole('button', { name: '共有' }).click();
  await expect.poll(() => shared(page)).toEqual([[expect.stringMatching(/\.png:image\/png$/)]]);
});

test('asks for a second tap when the share permission expired', async ({ page }) => {
  await mockShare(page, 'NotAllowedError');
  await openApp(page);
  const button = preview(page).getByRole('button', { name: '共有' });
  await button.click();
  await expect(page.getByText('もう一度「共有」を押してください', { exact: false })).toBeVisible();
  await button.click();
  await expect.poll(() => shared(page)).toHaveLength(1);
});

test('hides the button without the Web Share API', async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(Navigator.prototype, 'canShare');
    Reflect.deleteProperty(Navigator.prototype, 'share');
  });
  await openApp(page);
  await expect(preview(page).getByRole('button', { name: '保存', exact: true })).toBeVisible();
  await expect(preview(page).getByRole('button', { name: '共有' })).toHaveCount(0);
});
