import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { openApp, preview } from './helpers.ts';

async function openBackup(page: Page) {
  const menu = page.locator('details.settings');
  if ((await menu.getAttribute('open')) === null) await menu.locator('summary').click();
  await page.getByRole('button', { name: 'バックアップと復元' }).click();
  return page.getByRole('dialog', { name: 'バックアップと復元' });
}

test('backup: saves everything to one file and restores it in an empty browser', async ({ page, browser }) => {
  await openApp(page);
  // Data to carry over: a history entry, a template with a password, and the dark theme.
  await page.getByLabel('URL', { exact: true }).fill('https://example.com/backup-e2e');
  await preview(page).getByRole('button', { name: '履歴に保存' }).click();
  await expect(page.getByText('履歴に保存しました')).toBeVisible();
  await page.getByRole('group', { name: '内容' }).getByRole('button', { name: 'Wi-Fi', exact: true }).click();
  await page.getByLabel('ネットワーク名（SSID）').fill('Home');
  await page.getByLabel('パスワード', { exact: true }).fill('home-pass');
  await page.locator('details.templates summary').click();
  await page.locator('details.templates').getByLabel('テンプレート名').fill('自宅');
  await page.locator('details.templates').getByLabel('パスワードも保存する').check();
  await page.locator('details.templates').getByRole('button', { name: '現在の内容を保存' }).click();
  await expect(page.getByText('テンプレートを保存しました')).toBeVisible();
  await page.locator('summary[aria-label="表示設定"]').click();
  await page.getByLabel('テーマ').selectOption('dark');

  const dialog = await openBackup(page);
  await expect(dialog.getByText('プリセット 0 件・テンプレート 1 件・履歴 1 件・読取履歴 0 件（と各設定）')).toBeVisible();
  // The password is left out unless asked for.
  await expect(dialog.getByText(/Wi-Fi のパスワードを含むテンプレートがあります/)).toBeVisible();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'バックアップを保存' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^qr-studio-backup-\d{8}\.json$/);
  const json = await readFile((await file.path())!, 'utf8');
  expect(json).not.toContain('home-pass');

  // A fresh browser profile: restore there.
  const other = await browser.newContext({ locale: 'ja-JP', serviceWorkers: 'block' });
  const page2 = await other.newPage();
  await openApp(page2);
  const dialog2 = await openBackup(page2);
  await dialog2.getByLabel('バックアップファイルを選ぶ').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await expect(dialog2.getByText('プリセット 0 件・テンプレート 1 件・履歴 1 件・読取履歴 0 件（と各設定）')).toBeVisible();
  page2.once('dialog', (d) => d.accept());
  await dialog2.getByRole('button', { name: '復元する' }).click();

  await expect(page2.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page2.getByRole('navigation').getByRole('button', { name: '履歴', exact: true }).click();
  await expect(page2.getByText('https://example.com/backup-e2e').first()).toBeVisible();
  await page2.getByRole('navigation').getByRole('button', { name: '生成', exact: true }).click();
  await page2.getByRole('group', { name: '内容' }).getByRole('button', { name: 'Wi-Fi', exact: true }).click();
  await page2.locator('details.templates summary').click();
  await page2.locator('details.templates').getByRole('combobox', { name: '保存したWi-Fi' }).selectOption({ label: '自宅' });
  await page2.locator('details.templates').getByRole('button', { name: '入力する' }).click();
  await expect(page2.getByLabel('ネットワーク名（SSID）')).toHaveValue('Home');
  await expect(page2.getByLabel('パスワード', { exact: true })).toHaveValue('');
  await other.close();
});

test('backup: refuses a file that is not a backup', async ({ page }) => {
  await openApp(page);
  const dialog = await openBackup(page);
  await dialog.getByLabel('バックアップファイルを選ぶ').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
  await expect(dialog.getByText('QR Studio のバックアップファイルではありません')).toBeVisible();
});
