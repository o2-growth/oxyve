/**
 * Backend falso para E2E de telas logadas.
 *
 * O login é só Google, então não dá para entrar com uma conta de teste. Em vez
 * disso o teste planta uma sessão no localStorage (o supabase-js a lê no boot)
 * e responde as chamadas REST/RPC/Auth com dados fixos. Assim o teste cobre a
 * tela — navegação, permissão por papel, formulários — sem tocar em produção.
 * O que mora no banco (RLS, política, triggers) é testado contra o banco.
 *
 * O dev server do E2E sobe com VITE_SUPABASE_URL apontando para E2E_SUPABASE_URL
 * (playwright.config.ts), então nenhuma chamada sai da máquina.
 */
import type { Page, Route } from '@playwright/test';

export const E2E_SUPABASE_URL = 'https://e2e-mock.supabase.co';
const STORAGE_KEY = 'sb-e2e-mock-auth-token';

export type Role = 'employee' | 'manager' | 'admin';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-0000000000aa';

const SECTORS = ['Administrativo', 'Comercial'];
export const CATEGORIES = [
  ...SECTORS.flatMap((s, i) => [
    { id: `00000000-0000-4000-8000-00000000c${i}f0`, name: `Alimentação – ${s}`, kind: 'food', sector: s },
    { id: `00000000-0000-4000-8000-00000000c${i}t0`, name: `Deslocamento – ${s}`, kind: 'transport', sector: s },
  ]),
  { id: '00000000-0000-4000-8000-00000000c9o0', name: 'Hospedagem', kind: 'other', sector: null },
].map((c) => ({
  ...c,
  org_id: ORG_ID,
  department_id: null,
  department: null,
  daily_limit_cents: null,
  requires_receipt: true,
  is_active: true,
  created_at: '2026-09-24T00:00:00Z',
  updated_at: '2026-09-24T00:00:00Z',
}));

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function report() {
  const today = isoToday();
  return {
    id: '00000000-0000-4000-8000-0000000000r1',
    title: 'Relatório do ciclo',
    start_date: today,
    end_date: today,
    due_date: today,
    cycle_key: today.slice(0, 7),
    status: 'draft',
    created_at: `${today}T00:00:00Z`,
  };
}

function fakeJwt() {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, role: 'authenticated', exp })}.sig`;
}

function user() {
  return {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'colaborador@o2inc.com.br',
    app_metadata: { provider: 'google' },
    user_metadata: { full_name: 'Pessoa de Teste' },
    created_at: '2026-09-24T00:00:00Z',
  };
}

function profile() {
  return {
    id: USER_ID,
    org_id: ORG_ID,
    full_name: 'Pessoa de Teste',
    email: 'colaborador@o2inc.com.br',
    department_id: null,
    created_at: '2026-09-24T00:00:00Z',
    updated_at: '2026-09-24T00:00:00Z',
  };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/0' },
    body: JSON.stringify(body),
  });
}

const RPC: Record<string, () => unknown> = {
  get_dashboard_context: () => ({
    current_report: report(),
    pending_due_report: null,
    days_until_due: 10,
    today: isoToday(),
  }),
  get_or_create_current_report: report,
  get_or_create_report_for_date: report,
  get_org_members: () => [],
};

function tableRows(table: string, role: Role): unknown[] {
  switch (table) {
    case 'profiles':
      return [profile()];
    case 'user_roles':
      return [{ role }];
    case 'expense_categories':
      return CATEGORIES;
    case 'expense_policies':
      return [{ org_id: ORG_ID, cycle_cutoff_day: 25, food_daily_limit_cents: 3000, km_rate_cents: 120, currency: 'BRL' }];
    default:
      return [];
  }
}

/** Planta a sessão e intercepta o Supabase. Chamar antes do primeiro goto. */
export async function mockSupabase(page: Page, { role = 'employee' as Role } = {}) {
  const session = {
    access_token: fakeJwt(),
    refresh_token: 'e2e-refresh',
    token_type: 'bearer',
    expires_in: 3600 * 24,
    expires_at: Math.floor(Date.now() / 1000) + 3600 * 24,
    user: user(),
  };
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [STORAGE_KEY, JSON.stringify(session)] as const,
  );

  await page.route(`${E2E_SUPABASE_URL}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });

    const url = new URL(req.url());
    const path = url.pathname;

    if (path.startsWith('/auth/v1/user')) return json(route, user());
    if (path.startsWith('/auth/v1/')) return json(route, session);
    if (path.startsWith('/functions/v1/')) return json(route, {});
    if (path.startsWith('/storage/v1/')) return json(route, []);

    const rpc = path.match(/^\/rest\/v1\/rpc\/(\w+)/);
    if (rpc) return json(route, RPC[rpc[1]]?.() ?? null);

    const table = path.match(/^\/rest\/v1\/(\w+)/)?.[1];
    if (table) {
      if (req.method() !== 'GET' && req.method() !== 'HEAD') return json(route, []);
      const rows = tableRows(table, role);
      const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
      if (single) return rows[0] ? json(route, rows[0]) : json(route, { code: 'PGRST116', message: 'no rows' }, 406);
      return json(route, rows);
    }
    return json(route, {});
  });
}
