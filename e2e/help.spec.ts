import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openApp } from './helpers.ts';

test('help: opens from the footer, topics expand, and it passes axe', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: '使い方・よくある質問' }).click();
  const dialog = page.getByRole('dialog', { name: '使い方・よくある質問' });
  await dialog.getByText('後からリンク先を変えられる「動的QR」は作れますか？').click();
  await expect(dialog.getByText(/転送用のページ/)).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await dialog.getByRole('button', { name: '閉じる' }).click();
  await expect(dialog).toBeHidden();
});

test('feedback links to GitHub Issues in a new tab', async ({ page }) => {
  await openApp(page);
  const link = page.getByRole('link', { name: 'ご意見・不具合の報告（GitHub）' });
  await expect(link).toHaveAttribute('href', 'https://github.com/FloatedGecko667/qr-studio/issues/new');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
});
