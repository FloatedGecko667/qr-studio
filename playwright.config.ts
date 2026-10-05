import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;

// Runs against the production build (`npm run build` first), like the deployed PWA.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'ja-JP',
    // The service worker would serve stale builds between runs.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', testIgnore: /force-dark/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', testIgnore: /force-dark/, use: { ...devices['Pixel 7'] } },
    // Chrome's "Auto Dark Mode for Web Contents" only runs in the full Chromium build, not the headless shell.
    {
      name: 'force-dark',
      testMatch: /force-dark/,
      use: {
        // Desktop at DPR 1: there the heuristic darkens small inline SVG shapes (the test's control).
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        channel: 'chromium',
        launchOptions: { args: ['--enable-features=WebContentsForceDark'] },
      },
    },
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
