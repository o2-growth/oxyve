import { test, expect } from '@playwright/test';

test('PWA — service worker registra e app funciona', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  // Espera SW registrar (até 10s).
  const swActive = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    // pollar registration por até 10s
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && (reg.active || reg.installing || reg.waiting)) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  });
  console.log('[PWA] SW registered:', swActive);
  expect(swActive).toBe(true);

  // Manifest link presente.
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBe('/manifest.json');

  // Theme color presente.
  const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content');
  expect(themeColor).toBe('#3b82f6');

  // App ainda renderiza (não quebrou).
  await expect(page.locator('input[type="email"]')).toBeVisible();
  expect(errors.filter((e) => /forwardRef|undefined/.test(e))).toEqual([]);
});
