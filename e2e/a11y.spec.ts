import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openApp, openTab, switchMode } from './helpers.ts';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const MODES = ['QRコード', 'バーコード', '2次元コード'] as const;
const TABS = ['生成', '一括生成', '読取', '履歴'] as const;

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`WCAG 2.2 AA (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    for (const mode of MODES) {
      test(mode, async ({ page }) => {
        await openApp(page);
        await switchMode(page, mode);
        for (const tab of TABS) {
          await openTab(page, tab);
          await page.waitForLoadState('networkidle');
          const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
          const summary = violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
          expect(summary, `${mode} / ${tab}`).toEqual([]);
        }
      });
    }

    test('simple view', async ({ page }) => {
      await openApp(page, '/', 'simple');
      for (const mode of MODES) {
        await switchMode(page, mode);
        await page.waitForLoadState('networkidle');
        const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), mode).toEqual([]);
      }
    });
  });
}
