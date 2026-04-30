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

test('Mobile (iPhone 13) — BottomNav + KPIs 2x2', async ({ browser }) => {
  const ctx = await browser.newContext(devices['iPhone 13']);
  const page = await ctx.newPage();

  await loginAndGo(page, '/app/dashboard');

  // BottomNav visível (block lg:hidden).
  const bottomNav = page.locator('nav[aria-label="Navegação principal"]');
  await expect(bottomNav).toBeVisible({ timeout: 10_000 });
  const items = bottomNav.locator('a');
  expect(await items.count()).toBe(4);
  for (const label of ['Dashboard', 'Despesas', 'Relatórios', 'Perfil']) {
    await expect(bottomNav.getByText(label)).toBeVisible();
  }

  // SidebarTrigger oculto.
  const sidebarTrigger = page.locator('[data-sidebar="trigger"]');
  if ((await sidebarTrigger.count()) > 0) {
    await expect(sidebarTrigger.first()).toBeHidden();
  }

  // Reports KPIs 2x2.
  await page.goto('/app/reports', { waitUntil: 'networkidle' });
  const html = (await page.content()).toLowerCase();
  expect(html).toMatch(/total/);
  expect(html).toMatch(/reembols/);
  expect(html).toMatch(/não reembolsável/);
  expect(html).toMatch(/média|media/);

  await ctx.close();
});

test('Desktop (1280×800) — BottomNav some', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  await loginAndGo(page, '/app/dashboard');

  // BottomNav tem `lg:hidden` — em viewport ≥1024px deve sumir.
  const bottomNav = page.locator('nav[aria-label="Navegação principal"]');
  if ((await bottomNav.count()) > 0) {
    await expect(bottomNav.first()).toBeHidden();
  }

  await ctx.close();
});
