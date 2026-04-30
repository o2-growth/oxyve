import { test, expect } from '@playwright/test';

test('debug — login flow visível', async ({ page }) => {
  page.on('console', (msg) => console.log(`[browser ${msg.type()}]`, msg.text()));
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));
  page.on('requestfailed', (req) =>
    console.log('[reqfail]', req.url(), req.failure()?.errorText)
  );

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');
  console.log('URL após /', page.url());

  // Aguarda input de email aparecer
  await page.waitForSelector('input[type="email"]', { timeout: 30_000 });
  console.log('login form renderizou');

  await page.fill('input[type="email"]', process.env.SMOKE_EMAIL!);
  await page.fill('input[type="password"]', process.env.SMOKE_PASSWORD!);
  await page.screenshot({ path: 'test-results/debug-before-submit.png', fullPage: true });

  await page.click('button[type="submit"]:has-text("Entrar")');

  // Aguarda redirect ou erro
  try {
    await page.waitForURL(/\/app\/dashboard/, { timeout: 15_000 });
    console.log('✓ login OK, URL:', page.url());
  } catch (err) {
    console.log('✗ NÃO redirecionou. URL atual:', page.url());
    await page.screenshot({ path: 'test-results/debug-after-submit.png', fullPage: true });
    const toastText = await page.locator('[role="status"], [data-sonner-toast], .toast').allTextContents();
    console.log('Toasts visíveis:', toastText);
  }

  await page.screenshot({ path: 'test-results/debug-final.png', fullPage: true });
});
