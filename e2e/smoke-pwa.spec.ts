/**
 * PWA — roda contra o build de produção (:4173), porque o service worker
 * só é gerado no build.
 */
import { test, expect } from '@playwright/test';

test.use({ baseURL: 'http://localhost:4173' });

test('build de produção: service worker registra e o login renderiza sem erro', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/login', { waitUntil: 'networkidle' });

  const swActive = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && (reg.active || reg.installing || reg.waiting)) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  });
  expect(swActive).toBe(true);

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.json');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#3A3A3A');
  await expect(page.getByRole('button', { name: /entrar com google/i })).toBeVisible();
  expect(errors).toEqual([]);
});
