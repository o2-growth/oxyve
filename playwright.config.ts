/**
 * Sprint 3 — Playwright config para E2E.
 *
 * Configuração mínima:
 *   - baseURL aponta para o Vite dev server (porta 8080).
 *   - 1 retry em CI/local pra absorver flakes de cold start.
 *   - apenas Chromium (Firefox/WebKit ficam pra depois).
 *   - webServer roda `bun run dev` se ninguém estiver em :8080.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: process.env.CI ? [['list']] : [['list']],
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
