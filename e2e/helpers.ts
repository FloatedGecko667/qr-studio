import { expect, type Page } from '@playwright/test';

/**
 * Opens the app with a clean slate (settings, history and scan progress live in storage).
 * New users start in the simple view; tests use the detailed one unless they ask for `simple`.
 */
export async function openApp(page: Page, path = '/', view: 'simple' | 'detailed' = 'detailed'): Promise<void> {
  await page.addInitScript((v) => {
    try {
      if (!localStorage.getItem('qr-studio:settings')) localStorage.setItem('qr-studio:settings', JSON.stringify({ view: v }));
    } catch {
      // Storage blocked: the app falls back to its defaults.
    }
  }, view);
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'プレビュー' })).toBeVisible();
}

export async function switchMode(page: Page, mode: 'QRコード' | 'バーコード' | '2次元コード'): Promise<void> {
  await page.getByRole('group', { name: 'コードの種類' }).getByRole('button', { name: mode }).click();
}

export async function openTab(page: Page, name: '生成' | '一括生成' | '読取' | '履歴'): Promise<void> {
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
}

export const preview = (page: Page) => page.getByRole('region', { name: 'プレビュー' });
