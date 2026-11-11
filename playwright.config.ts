import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/browser',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/counterplay/',
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' }, testIgnore: '**/mobile.spec.ts' },
    { name: 'firefox', use: { browserName: 'firefox' }, testIgnore: '**/mobile.spec.ts' },
    { name: 'webkit', use: { browserName: 'webkit' }, testIgnore: '**/mobile.spec.ts' },
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' }, testMatch: '**/mobile.spec.ts' },
  ],
  webServer: [
    {
      command: 'npm run preview -- --port 4173 --strictPort --base /counterplay/',
      url: 'http://127.0.0.1:4173/counterplay/',
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -- --port 4174 --strictPort',
      url: 'http://127.0.0.1:4174/tests/board.html',
      reuseExistingServer: false,
    },
  ],
})
