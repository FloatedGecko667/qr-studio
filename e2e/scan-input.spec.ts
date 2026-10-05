import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { openApp, openTab, preview } from './helpers.ts';

async function savedQr(page: Page, url: string): Promise<string> {
  await page.getByLabel('URL', { exact: true }).fill(url);
  const download = page.waitForEvent('download');
  await preview(page).getByRole('button', { name: '保存', exact: true }).click();
  return (await readFile((await (await download).path())!)).toString('base64');
}

/** Dispatches a synthetic event carrying the image as a File (pasted or dropped). */
async function sendImage(page: Page, kind: 'paste' | 'drop', base64: string, type = 'image/png') {
  // The scan tab is loaded on first use; its listeners exist once the card is shown.
  await expect(page.locator('section[aria-labelledby="scan-heading"]')).toBeVisible();
  await page.evaluate(
    ({ kind, base64, type }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'code.png', { type }));
      if (kind === 'paste') {
        document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
      } else {
        const card = document.querySelector('section[aria-labelledby="scan-heading"]')!;
        card.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
        card.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      }
    },
    { kind, base64, type },
  );
}

test('scan: a pasted image is read', async ({ page }) => {
  await openApp(page);
  const png = await savedQr(page, 'https://example.com/pasted');
  await openTab(page, '読取');
  await sendImage(page, 'paste', png);
  await expect(page.locator('pre')).toHaveText('https://example.com/pasted', { timeout: 20_000 });
});

test('scan: a dropped image is read', async ({ page }) => {
  await openApp(page);
  const png = await savedQr(page, 'https://example.com/dropped');
  await openTab(page, '読取');
  await sendImage(page, 'drop', png);
  await expect(page.locator('pre')).toHaveText('https://example.com/dropped', { timeout: 20_000 });
});

test('scan: dropping something that is not an image explains why', async ({ page }) => {
  await openApp(page);
  await openTab(page, '読取');
  await sendImage(page, 'drop', btoa('hello'), 'text/plain');
  await expect(page.getByText('画像ファイルではありません')).toBeVisible();
});

test('scan: pasting into a text field is left alone', async ({ page }) => {
  await openApp(page);
  await openTab(page, '読取');
  // The scan tab has no text field of its own, so add one to stand in for any input.
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'probe';
    document.querySelector('main')!.append(input);
  });
  await page.locator('#probe').focus();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array([1])], 'x.png', { type: 'image/png' }));
    document.getElementById('probe')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  });
  await expect(page.getByText('画像を読み込めませんでした')).toHaveCount(0);
});
