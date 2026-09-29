import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers.ts';

const panel = (page: Page) => page.locator('details.templates');

async function openPanel(page: Page) {
  const details = panel(page);
  if (!(await details.getAttribute('open'))) await details.locator('summary').click();
}

test('Wi-Fi template: saves without the password by default, restores after reload, deletes', async ({ page }) => {
  await openApp(page);
  await page.getByRole('group', { name: '内容' }).getByRole('button', { name: 'Wi-Fi', exact: true }).click();
  const ssid = page.getByLabel('ネットワーク名（SSID）');
  const password = page.getByLabel('パスワード', { exact: true });
  await ssid.fill('Office-5G');
  await password.fill('s3cret');

  await openPanel(page);
  await expect(panel(page).getByText('保存したWi-Fiのテンプレートはありません')).toBeVisible();
  await panel(page).getByLabel('テンプレート名').fill('会社');
  await panel(page).getByRole('button', { name: '現在の内容を保存' }).click();
  await expect(panel(page).getByText('テンプレートを保存しました')).toBeVisible();

  // A second template that keeps the password.
  await ssid.fill('Home');
  await password.fill('home-pass');
  await panel(page).getByLabel('テンプレート名').fill('自宅');
  await panel(page).getByLabel('パスワードも保存する').check();
  await panel(page).getByRole('button', { name: '現在の内容を保存' }).click();
  await expect(panel(page).getByRole('combobox', { name: '保存したWi-Fi' }).locator('option')).toHaveCount(2);

  await page.reload();
  await page.getByRole('group', { name: '内容' }).getByRole('button', { name: 'Wi-Fi', exact: true }).click();
  await openPanel(page);
  const list = panel(page).getByRole('combobox', { name: '保存したWi-Fi' });
  await list.selectOption({ label: '会社' });
  await panel(page).getByRole('button', { name: '入力する' }).click();
  await expect(ssid).toHaveValue('Office-5G');
  await expect(password).toHaveValue('');

  await list.selectOption({ label: '自宅' });
  await panel(page).getByRole('button', { name: '入力する' }).click();
  await expect(ssid).toHaveValue('Home');
  await expect(password).toHaveValue('home-pass');

  page.once('dialog', (d) => d.accept());
  await panel(page).getByRole('button', { name: '削除' }).click();
  await expect(list.locator('option')).toHaveCount(1);
});

test('templates are offered per input kind and not for images', async ({ page }) => {
  await openApp(page);
  await page.getByRole('group', { name: '内容' }).getByRole('button', { name: 'テキスト', exact: true }).click();
  await expect(panel(page)).toBeVisible();
  await page.getByRole('group', { name: '内容' }).getByRole('button', { name: '画像', exact: true }).click();
  await expect(panel(page)).toHaveCount(0);
});
