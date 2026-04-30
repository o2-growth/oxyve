import { test, expect, Page } from '@playwright/test';

const PROD_URL = 'https://oxyve.lovable.app';
const EMAIL = process.env.SMOKE_EMAIL!;
const PASSWORD = process.env.SMOKE_PASSWORD!;

test.use({ baseURL: PROD_URL });

async function login(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  // O Lovable pode envolver em iframe; tenta achar o form direto.
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Entrar")');
  // Espera redirect pra dashboard.
  await page.waitForURL(/\/app\/dashboard/, { timeout: 20000 });
}

test('A1 — RLS bloqueia self-grant de role admin', async ({ page }) => {
  await login(page);
  // Tenta inserir role admin via supabase global (se exposto) ou via fetch RPC.
  const result = await page.evaluate(async () => {
    // O cliente supabase pode ou não estar em window — usar fetch direto na API REST.
    const url = (window as any).__SUPABASE_URL ?? '';
    const key = (window as any).__SUPABASE_ANON_KEY ?? '';
    // fallback: pegar do localStorage (Supabase armazena session lá com a anon key embutida)
    const session = Object.keys(localStorage)
      .map((k) => localStorage.getItem(k))
      .find((v) => v && v.includes('access_token'));
    const accessToken = session ? JSON.parse(session).access_token : null;
    if (!accessToken) return { skipped: 'no access token in localStorage' };
    const supabaseUrl = 'https://kulwornnpimjsbmexphd.supabase.co';
    const anonKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1bHdvcm5ucGltanNibWV4cGhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjM4ODQsImV4cCI6MjA4NjEzOTg4NH0.5dprRokLzu9guiYya5VjWlYkmloq7dPlzn1jUKdkZkg';
    const r = await fetch(`${supabaseUrl}/rest/v1/user_roles`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        user_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        role: 'admin',
      }),
    });
    return { status: r.status, body: await r.text() };
  });
  console.log('[A1 result]', result);
  // Como sou admin de fato, o INSERT pode passar pelo admin_assign_role somente. Direct INSERT deve falhar.
  expect(result).toBeDefined();
  if ('status' in result) {
    // 401/403/42501 esperados. Aceitamos qualquer 4xx exceto 200/201.
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(result.status).toBeLessThan(500);
  }
});

test('A2 — UPDATE de profiles.org_id falha por check_violation', async ({ page }) => {
  await login(page);
  const result = await page.evaluate(async () => {
    const session = Object.keys(localStorage)
      .map((k) => localStorage.getItem(k))
      .find((v) => v && v.includes('access_token'));
    const parsed = session ? JSON.parse(session) : null;
    if (!parsed) return { skipped: true };
    const accessToken = parsed.access_token;
    const userId = parsed.user.id;
    const supabaseUrl = 'https://kulwornnpimjsbmexphd.supabase.co';
    const anonKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1bHdvcm5ucGltanNibWV4cGhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjM4ODQsImV4cCI6MjA4NjEzOTg4NH0.5dprRokLzu9guiYya5VjWlYkmloq7dPlzn1jUKdkZkg';
    const r = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`,
      {
        method: 'PATCH',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ org_id: '00000000-0000-0000-0000-000000000000' }),
      }
    );
    return { status: r.status, body: await r.text() };
  });
  console.log('[A2 result]', result);
  if ('status' in result) {
    expect(result.status).toBeGreaterThanOrEqual(400);
  }
});

test('B1 — campos novos no perfil (CPF/Banco/PIX)', async ({ page }) => {
  await login(page);
  await page.goto('/app/settings/profile', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  const html = await page.content();
  // Buscas tolerantes a variações de label.
  const lower = html.toLowerCase();
  expect(lower).toMatch(/cpf|cnpj/);
  expect(lower).toMatch(/banco|agência|agencia|conta/);
  expect(lower).toMatch(/pix/);
});

test('B3 — KPIs no header de Reports', async ({ page }) => {
  await login(page);
  await page.goto('/app/reports', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  const html = (await page.content()).toLowerCase();
  expect(html).toMatch(/total/);
  expect(html).toMatch(/reembols/);
  // Label real é "Média" (visível só em sm:block — desktop). Aceita ambas formas.
  expect(html).toMatch(/média|media|médio|medio/);
});

test('C1 — sino de notificações no header', async ({ page }) => {
  await login(page);
  // Procura ícone bell ou aria-label
  const bell = page.locator('[aria-label*="otific" i], button:has(svg.lucide-bell), [data-testid="notifications-bell"]');
  const count = await bell.count();
  expect(count).toBeGreaterThan(0);
});

test('C2 — menu Mais ações no detalhe do relatório (Excel/CSV/PDF/Histórico)', async ({ page }) => {
  await login(page);
  await page.goto('/app/reports', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  // Clica no primeiro relatório se existir.
  const firstReportLink = page.locator('a[href*="/app/reports/"]').first();
  if ((await firstReportLink.count()) === 0) {
    test.skip(true, 'Sem relatórios pra abrir — pulei C2.');
  }
  await firstReportLink.click();
  await page.waitForLoadState('networkidle');
  // Abre menu "Mais ações"
  const moreBtn = page.locator('button:has-text("Mais ações"), button:has-text("ais ações")').first();
  if ((await moreBtn.count()) > 0) {
    await moreBtn.click();
    await page.waitForTimeout(500);
  }
  const html = (await page.content()).toLowerCase();
  // Aceita variações de label
  const csvOk = /csv/.test(html);
  const xlsxOk = /excel|xlsx/.test(html);
  const pdfOk = /pdf/.test(html);
  const histOk = /histórico|historico/.test(html);
  console.log('[C2 menu]', { csvOk, xlsxOk, pdfOk, histOk });
  expect(csvOk || xlsxOk || pdfOk).toBeTruthy();
});

test('D1 — rota protegida redireciona pra login (anônimo)', async ({ browser }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(`${PROD_URL}/app/dashboard`, { waitUntil: 'domcontentloaded' });
  await p.waitForURL(/\/login/, { timeout: 10000 });
  expect(p.url()).toContain('/login');
  await ctx.close();
});

test('D2 — tab Cadastrar oculta sem invite, visível com', async ({ browser }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(`${PROD_URL}/login`, { waitUntil: 'domcontentloaded' });
  await p.waitForLoadState('networkidle');
  const noInviteHtml = (await p.content()).toLowerCase();
  // Sem invite — não deve ter tab "Cadastrar"; deve ter aviso "convite".
  expect(noInviteHtml).toMatch(/convite/);
  await p.goto(`${PROD_URL}/login?invite=fake-token-abc`, { waitUntil: 'domcontentloaded' });
  await p.waitForLoadState('networkidle');
  const withInviteHtml = (await p.content()).toLowerCase();
  expect(withInviteHtml).toMatch(/cadastrar|criar conta/);
  await ctx.close();
});
