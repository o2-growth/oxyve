/**
 * Playwright — E2E.
 *
 *   - Dois servidores, os dois com o Supabase apontado para um host falso
 *     (e2e/support/mockSupabase.ts intercepta tudo; nada sai da máquina):
 *       :8090  dev server, para as telas;
 *       :4173  build de produção, para o que só existe no build (service worker).
 *   - Portas próprias, para não reaproveitar um `vite` aberto com o .env real.
 *   - Só Chromium.
 */
import { defineConfig, devices } from '@playwright/test';
import { E2E_SUPABASE_URL } from './e2e/support/mockSupabase';

const env = {
  VITE_SUPABASE_URL: E2E_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: 'e2e-anon-key',
  VITE_SUPABASE_PROJECT_ID: 'e2e-mock',
};

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8090',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'npx vite --port 8090 --strictPort',
      url: 'http://localhost:8090',
      reuseExistingServer: false,
      timeout: 60_000,
      env,
    },
    {
      command: 'npx vite build --mode production && npx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: false,
      timeout: 180_000,
      env,
    },
  ],
});
