import { test, expect } from '@playwright/test';

test('bundle local — sem forwardRef error + login renderiza', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('http://127.0.0.1:4173/login', { waitUntil: 'networkidle' });
  await page.waitForSelector('input[type="email"]', { timeout: 15_000 });

  expect(errors.filter((e) => /forwardRef/.test(e))).toEqual([]);

  // Confirma que o form renderizou.
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('button:has-text("Entrar")')).toBeVisible();
});
