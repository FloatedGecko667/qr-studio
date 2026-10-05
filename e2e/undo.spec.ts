import { expect, test, type Page } from '@playwright/test';
import { openApp, switchMode } from './helpers.ts';

/** The app picks ⌘ or Ctrl from navigator.platform; press what it expects. */
async function press(page: Page, combo: 'undo' | 'redo') {
  const mac = await page.evaluate(() => /mac|iphone|ipad/i.test(navigator.platform));
  await page.keyboard.press(combo === 'undo' ? (mac ? 'Meta+z' : 'Control+z') : mac ? 'Meta+Shift+z' : 'Control+y');
}

test('QR: buttons and shortcuts undo and redo design changes', async ({ page }) => {
  await openApp(page);
  const undo = page.getByRole('button', { name: '元に戻す' });
  const redo = page.getByRole('button', { name: 'やり直す' });
  const fg = page.getByLabel('前景色');
  const shape = page.getByLabel('セルの形');
  await expect(undo).toBeDisabled();

  await fg.fill('#aa0000');
  await shape.selectOption('dot');
  await expect(undo).toBeEnabled();

  await undo.click();
  await expect(shape).toHaveValue('square');
  await expect(fg).toHaveValue('#aa0000');
  await undo.click();
  await expect(fg).toHaveValue('#000000');
  await expect(undo).toBeDisabled();

  await redo.click();
  await expect(fg).toHaveValue('#aa0000');
  // Shortcuts work outside text fields (here: on the page body).
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await press(page, 'redo');
  await expect(shape).toHaveValue('dot');
  await press(page, 'undo');
  await expect(shape).toHaveValue('square');

  // Settings survive a reload in the undone state.
  await page.reload();
  await expect(page.getByLabel('セルの形')).toHaveValue('square');
});

test('QR: a design template is one step', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: '夜空 を適用' }).click();
  await expect(page.getByLabel('セルの形')).toHaveValue('rounded');
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(page.getByLabel('セルの形')).toHaveValue('square');
  await expect(page.getByLabel('前景色')).toHaveValue('#000000');
});

test('text fields keep their own undo', async ({ page }) => {
  await openApp(page);
  await page.getByLabel('前景色').fill('#aa0000');
  const url = page.getByLabel('URL', { exact: true });
  await url.fill('https://example.com/a');
  await url.focus();
  await press(page, 'undo');
  // The colour is not undone while typing in the URL field.
  await expect(page.getByLabel('前景色')).toHaveValue('#aa0000');
});

test('barcode: changing the symbology is undone, with its sample data', async ({ page }) => {
  await openApp(page);
  await switchMode(page, 'バーコード');
  const type = page.getByRole('combobox', { name: 'バーコードの種類' });
  const data = page.getByLabel('データ', { exact: true });
  const before = await type.inputValue();
  const value = await data.inputValue();
  await type.selectOption({ label: 'Code 39' });
  await expect(data).not.toHaveValue(value);
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(type).toHaveValue(before);
  await expect(data).toHaveValue(value);
});
