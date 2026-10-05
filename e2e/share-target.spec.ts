import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { openApp, preview } from './helpers.ts';

// The share target lives in the service worker, so this file lets it run.
test.use({ serviceWorkers: 'allow' });

test('share target: an image shared to the app is read on the scan tab, then removed', async ({ page }) => {
  await openApp(page);
  await page.getByLabel('URL', { exact: true }).fill('https://example.com/shared');
  const download = page.waitForEvent('download');
  await preview(page).getByRole('button', { name: '保存', exact: true }).click();
  const png = (await readFile((await (await download).path())!)).toString('base64');

  // Wait for the service worker, then reload so it controls the page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // What the OS share sheet does: a multipart POST navigation to the share target.
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'photo.png', { type: 'image/png' }));
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/share-target';
    form.enctype = 'multipart/form-data';
    const input = document.createElement('input');
    input.type = 'file';
    input.name = 'image';
    input.files = dt.files;
    form.append(input);
    document.body.append(form);
    form.submit();
  }, png);

  await expect(page.locator('pre')).toHaveText('https://example.com/shared', { timeout: 20_000 });
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => caches.has('qr-studio-share'))).toBe(false);
});

test('share target: something that is not an image is refused with a message', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['hello'], 'note.txt', { type: 'text/plain' }));
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/share-target';
    form.enctype = 'multipart/form-data';
    const input = document.createElement('input');
    input.type = 'file';
    input.name = 'image';
    input.files = dt.files;
    form.append(input);
    document.body.append(form);
    form.submit();
  });
  await expect(page.getByText('共有された画像を受け取れませんでした')).toBeVisible({ timeout: 10_000 });
});
