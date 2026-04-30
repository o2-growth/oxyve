import { test, expect, devices, type Page } from '@playwright/test';

const EMAIL = process.env.SMOKE_EMAIL!;
const PASSWORD = process.env.SMOKE_PASSWORD!;

async function loginAndGo(page: Page, route: string) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.waitForSelector('input[type="email"]', { timeout: 15_000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Entrar")');
  await page.waitForURL(/\/app\/dashboard/, { timeout: 20_000 });
  if (route !== '/app/dashboard') {
    await page.goto(route, { waitUntil: 'networkidle' });
  }
}

test('Mobile (iPhone 13) — FAB visível em /app/dashboard, /app/expenses, /app/reports e oculto em /app/settings', async ({ browser }) => {
  const ctx = await browser.newContext(devices['iPhone 13']);
  const page = await ctx.newPage();

  // FAB tem aria-label "Nova despesa por foto" (vide QuickExpenseFab).
  const fab = page.locator('button[aria-label="Nova despesa por foto"]');

  await loginAndGo(page, '/app/dashboard');

  for (const route of ['/app/dashboard', '/app/expenses', '/app/reports']) {
    if (page.url() !== `${route}` && !page.url().endsWith(route)) {
      await page.goto(route, { waitUntil: 'networkidle' });
    }
    await page.waitForLoadState('networkidle');
    await fab.first().waitFor({ state: 'attached', timeout: 10_000 });
    const visible = await fab.first().isVisible();
    console.log(`[FAB ${route}] visible=${visible}`);
    expect(visible, `FAB deveria estar visível em ${route}`).toBe(true);
  }

  // Em /app/settings/profile o FAB deve sumir.
  await page.goto('/app/settings/profile', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500); // estabiliza após route change
  const fabInSettings = await fab.first().isVisible().catch(() => false);
  console.log('[FAB /settings] visible=', fabInSettings);
  expect(fabInSettings, 'FAB NÃO deveria aparecer em /app/settings').toBe(false);

  await ctx.close();
});
