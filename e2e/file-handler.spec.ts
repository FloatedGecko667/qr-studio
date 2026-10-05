import { expect, test, type Page } from '@playwright/test';
import { openApp, switchMode } from './helpers.ts';

/** Stands in for the browser's launchQueue: the test hands the app a file as the OS would. */
async function fakeLaunchQueue(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __launch: (p: unknown) => void };
    // Chromium has a read-only launchQueue of its own: replace the property itself.
    Object.defineProperty(window, 'launchQueue', { configurable: true, value: { setConsumer: (c: (p: unknown) => void) => (w.__launch = c) } });
  });
}

async function launchWith(page: Page, name: string, body: string) {
  await page.evaluate(
    ([n, b]) => {
      const file = new File([b], n, { type: 'text/csv' });
      (window as unknown as { __launch: (p: unknown) => void }).__launch({ files: [{ getFile: async () => file }] });
    },
    [name, body],
  );
}

test('the manifest offers to open CSV files', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.file_handlers).toEqual([{ action: '/?tab=batch', accept: { 'text/csv': ['.csv'] } }]);
});

test('a CSV opened with the app lands in the QR batch screen', async ({ page }) => {
  await fakeLaunchQueue(page);
  await openApp(page);
  await launchWith(page, 'list.csv', 'content,filename\nhttps://example.com/a,a\nhttps://example.com/b,b');
  await expect(page.getByRole('navigation').getByRole('button', { name: '一括生成', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('group', { name: '入力形式' }).getByRole('button', { name: 'CSV' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('入力', { exact: true })).toHaveValue(/example\.com\/b,b/);
  await expect(page.getByText('2 件', { exact: true })).toBeVisible();
});

test('in barcode mode it goes to the barcode batch; oversized files are refused', async ({ page }) => {
  await fakeLaunchQueue(page);
  await openApp(page);
  await switchMode(page, 'バーコード');
  await launchWith(page, 'codes.csv', 'content\nABC-1\nABC-2\nABC-3');
  await expect(page.getByLabel('入力', { exact: true })).toHaveValue(/ABC-3/);

  await launchWith(page, 'big.csv', 'x'.repeat(5 * 1024 * 1024 + 1));
  await expect(page.getByRole('alert')).toHaveText('CSV ファイルが大きすぎます（最大 5 MB）');
  await expect(page.getByLabel('入力', { exact: true })).toHaveValue(/ABC-3/);
});
