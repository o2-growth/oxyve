/**
 * Config separada pra smoke test em produção (oxyve.vercel.app).
 * Não inicia dev server. Uso ad-hoc:
 *   npx playwright test --config=playwright-prod.config.ts
 */
import { defineConfig, devices } from '@playwright/test';

// O smoke-pwa.spec.ts fixa a porta do build local (:4173); esta variável o
// aponta para produção quando roda por esta config.
process.env.PWA_BASE_URL ??= 'https://oxyve.vercel.app';

export default defineConfig({
  testDir: './e2e',
  // Só o que existe em e2e/ (os outros smokes antes listados aqui não existem).
  testMatch: /smoke-pwa\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'https://oxyve.vercel.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
