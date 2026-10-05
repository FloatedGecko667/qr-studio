import { expect, test, type Page } from '@playwright/test';
import { openApp, preview, switchMode } from './helpers.ts';

/** Replaces the print dialog: records that it was opened and leaves the print layout in place. */
async function stubPrint(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => {
      (window as unknown as { printed: number }).printed++;
    };
  });
}

test('QR: prints at the mm size, only the code on the page', async ({ page }) => {
  await openApp(page);
  await preview(page).getByRole('button', { name: 'mm' }).click();
  await stubPrint(page);
  await preview(page).getByRole('button', { name: '印刷', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);

  const svg = page.locator('#qr-print-root svg');
  await expect(svg).toHaveCount(1);
  await expect(svg).toHaveAttribute('width', '30mm');
  expect(await page.locator('#qr-print-style').textContent()).toContain('@page { size: 30mm 30mm; margin: 0; }');

  await page.emulateMedia({ media: 'print' });
  await expect(svg).toBeVisible();
  await expect(page.locator('header').first()).toBeHidden();

  // After the dialog closes the print layout is removed.
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('#qr-print-root')).toHaveCount(0);
});

test('QR: structured append prints one symbol per page', async ({ page }) => {
  await openApp(page);
  await page.getByLabel('連結（分割数）').selectOption('3');
  await stubPrint(page);
  await preview(page).getByRole('button', { name: '印刷', exact: true }).click();
  await expect(page.locator('#qr-print-root .page')).toHaveCount(3);
  await expect(preview(page).getByText(/96dpi/)).toBeVisible();
});

test('barcode: prints at the X dimension in mm', async ({ page }) => {
  await openApp(page);
  await switchMode(page, 'バーコード');
  await page.getByRole('region', { name: '印刷サイズ' }).getByRole('button', { name: 'X寸法を 0.5 mm にする' }).click();
  await stubPrint(page);
  await preview(page).getByRole('button', { name: '印刷', exact: true }).click();
  await expect(page.locator('#qr-print-root svg')).toHaveAttribute('width', '99mm');
});
