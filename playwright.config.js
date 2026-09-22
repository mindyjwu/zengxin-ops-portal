const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './__tests__',
  testMatch: '**/*.e2e.test.js',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'junit-report.xml' }],
    ['list']
  ],
  use: {
    baseURL: undefined,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: undefined,
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchArgs: [
          '--disable-blink-features=AutomationControlled'
        ]
      },
    },
  ],
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
});
