import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests', testMatch: '**/*.pw.ts', fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  workers: 2, // Match the local geometry service's native job limit.
  use: {
    baseURL: 'http://127.0.0.1:1420', viewport: { width: 1440, height: 940 },
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: process.env.CI ? { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {},
  },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:1420', reuseExistingServer: !process.env.CI, timeout: 120000 },
})
