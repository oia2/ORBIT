import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results',
  snapshotPathTemplate: '{testDir}/visual/__screenshots__/{projectName}/{arg}{ext}',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  fullyParallel: false,
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
    baseURL: 'http://127.0.0.1:4173',
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
    command: 'npm run preview -- --host 127.0.0.1',
    port: 4173,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
