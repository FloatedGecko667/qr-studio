import { expect, test, type Locator, type Page } from '@playwright/test';
import { openApp, preview, switchMode } from './helpers.ts';

// Runs only in the "force-dark" project: Chromium with Auto Dark Mode for Web Contents.
// With the "system" theme the browser reports a dark preference and the app's own dark theme
// applies, so nothing is force-darkened. Force-dark only kicks in when the light theme is chosen.

async function openLight(page: Page): Promise<void> {
  await openApp(page);
  await page.locator('summary[aria-label="表示設定"]').click();
  await page.getByLabel('テーマ').selectOption('light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
}

/** Share of dark and light pixels in an element's screenshot. */
async function tones(page: Page, target: Locator): Promise<{ dark: number; light: number }> {
  const png = (await target.screenshot()).toString('base64');
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    let light = 0;
    for (let i = 0; i < d.length; i += 4) {
      const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      if (y < 64) dark++;
      else if (y > 192) light++;
    }
    const n = d.length / 4;
    return { dark: dark / n, light: light / n };
  }, png);
}

test('QR keeps its colours while the page is darkened', async ({ page }) => {
  await openLight(page);
  const symbol = preview(page).locator('.symbol');
  await expect(symbol.locator('canvas')).toBeVisible();

  // The page itself is re-coloured by the browser.
  const bg = await tones(page, page.locator('header').first());
  expect(bg.dark).toBeGreaterThan(0.5);

  const qr = await tones(page, symbol);
  expect(qr.dark).toBeGreaterThan(0.2);
  expect(qr.light).toBeGreaterThan(0.2);
});

test('barcodes keep their colours too', async ({ page }) => {
  await openLight(page);
  await switchMode(page, 'バーコード');
  const symbol = preview(page).locator('.symbol');
  await expect(symbol.locator('canvas')).toBeVisible();
  const bars = await tones(page, symbol);
  expect(bars.dark).toBeGreaterThan(0.2);
  expect(bars.light).toBeGreaterThan(0.2);
});

test('the preview dock thumbnail keeps its colours on phones', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 860 });
  await openLight(page);
  await page.mouse.wheel(0, 1600);
  const thumb = page.getByRole('button', { name: 'プレビューに戻る' }).locator('.thumb');
  await expect(thumb.locator('canvas')).toBeVisible();
  const t = await tones(page, thumb);
  expect(t.dark).toBeGreaterThan(0.2);
  expect(t.light).toBeGreaterThan(0.2);
});

// Why codeSurface paints to a canvas: force-dark's heuristics can lighten the dark shapes of a
// small inline SVG (even inside a `color-scheme: only light` element) but leave canvas pixels alone.
test('force-dark spares canvas pixels but not inline SVG shapes', async ({ page }) => {
  // The heuristic treats small SVGs (icon-sized, like the 56px preview dock thumbnail) as foreground.
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2" width="40" height="40" shape-rendering="crispEdges">' +
    '<rect width="2" height="2" fill="#fff"/><rect width="1" height="1" fill="#000"/></svg>';
  await page.setContent(
    `<!doctype html><html><head><style>:root{color-scheme:light}body{background:#fff;margin:0;line-height:0}</style></head>` +
      `<body><div id="svg" style="color-scheme:only light;width:40px">${svg}</div><canvas id="canvas" width="40" height="40"></canvas>` +
      `<script>const x=document.getElementById('canvas').getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,40,40);x.fillStyle='#000';x.fillRect(0,0,20,20);</script></body></html>`,
  );
  const inline = await tones(page, page.locator('#svg'));
  const painted = await tones(page, page.locator('#canvas'));
  expect(inline.dark).toBeLessThan(0.05);
  expect(painted.dark).toBeGreaterThan(0.2);
});
