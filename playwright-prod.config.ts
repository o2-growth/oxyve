/**
 * Config separada pra smoke test em produção (oxyve.lovable.app).
 * Não inicia dev server. Uso ad-hoc:
 *   SMOKE_EMAIL=... SMOKE_PASSWORD=... bunx playwright test --config=playwright-prod.config.ts
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /smoke-prod\.spec\.ts|debug-login\.spec\.ts|smoke-local-bundle\.spec\.ts|smoke-pwa\.spec\.ts|smoke-mobile\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'https://oxyve.lovable.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
