import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const E2E_PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results',
  globalTeardown: fileURLToPath(new URL('./e2e/global-teardown.ts', import.meta.url)),
  snapshotPathTemplate: '{testDir}/visual/__screenshots__/{projectName}/{arg}{ext}',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  fullyParallel: false,
  /*
   * One worker, because there is now one database.
   *
   * Under IndexedDB every worker had its own browser profile and therefore its
   * own storage, so Playwright could run test files in parallel safely. A
   * server-backed deployment has a single database: two workers seeding and
   * truncating it at once would each see the other's fixture, and the failures
   * would look like flakiness rather than what they are.
   */
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.002,
      scale: 'css',
    },
  },
  use: {
    baseURL: `http://127.0.0.1:${String(E2E_PORT)}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium-keyboard',
      testMatch: '**/journeys/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'tablet-webkit-touch',
      testMatch: '**/journeys/**/*.spec.ts',
      use: { ...devices['iPad (gen 7)'], viewport: { width: 820, height: 1180 } },
    },
    {
      name: 'mobile-webkit-touch',
      testMatch: '**/journeys/**/*.spec.ts',
      use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'visual-chromium',
      testMatch: '**/visual/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        colorScheme: 'dark',
        deviceScaleFactor: 1,
        locale: 'ru-RU',
        // The orbit field animates on a canvas, so screenshots are only stable
        // with motion reduced — which also renders its deterministic frame.
        contextOptions: { reducedMotion: 'reduce' },
        timezoneId: 'Asia/Krasnoyarsk',
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    /*
     * The real server, serving the built client from one origin — not a static
     * preview. E2E now exercises the same process a deployment runs, including
     * the API the client depends on for every fact it shows.
     */
    command: 'node --import tsx e2e/e2e-server.ts',
    port: E2E_PORT,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: String(E2E_PORT),
    },
  },
});
