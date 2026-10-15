/**
 * Gestão: erro de rede não vira "acesso restrito" (B5) e o pagamento por pessoa
 * deixa de fora despesa não reembolsável (uso-real-3).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Overview = { isLoading: boolean; isError: boolean; error: unknown; data: unknown; refetch: () => void };
let overview: Overview;
const refetch = vi.fn();
const rpc = vi.fn().mockResolvedValue({ data: { paid: 1 }, error: null });

const person = {
  user_id: 'u2',
  full_name: 'Bia',
  email: 'bia@x.com',
  food_realized_cents: 0,
  transport_realized_cents: 0,
  // O painel (RPC) ainda soma o não reembolsável.
  a_pagar_cents: 8000,
  realized_cents: 0,
  aguardando_aprovacao_cents: 0,
  recusados: 0,
  excecoes: 0,
  transport_projected_cents: 0,
  food_projected_cents: 0,
};

const expenses = [
  { id: 'a', date: '2026-10-01', description: 'Almoço', amount_cents: 6000, reimbursable_cents: 3000, currency: 'BRL', status: 'approved', is_reimbursable: true, is_out_of_policy: false, is_event: false },
  { id: 'b', date: '2026-10-02', description: 'Táxi no cartão da empresa', amount_cents: 5000, reimbursable_cents: 5000, currency: 'BRL', status: 'approved', is_reimbursable: false, is_out_of_policy: false, is_event: false },
];

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.order = () => Promise.resolve({ data: expenses, error: null });
  return { supabase: { from: () => chain, rpc: (...args: unknown[]) => rpc(...args) } };
});
vi.mock('@/hooks/useAdminOverview', () => ({ useAdminOverview: () => overview }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true, isManager: true, isLoading: false }),
}));
vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/gestao/GestaoUsuarios', () => ({ GestaoUsuarios: () => null }));
vi.mock('@/components/gestao/GestaoCategorias', () => ({ GestaoCategorias: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import Gestao from '@/pages/app/Gestao';

function renderGestao() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Gestao />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const okOverview = (): Overview => ({
  isLoading: false,
  isError: false,
  error: null,
  refetch,
  data: {
    cycle: { cycle_key: '2026-10', start: '2026-10-01', end: '2026-10-31', business_days: 22 },
    org: { colaboradores: 1, food_daily_limit_cents: 3000, food_budget_cents: 0, food_realized_cents: 0, transport_realized_cents: 0, total_a_pagar_cents: 8000, realized_cents: 0, aguardando_aprovacao_cents: 0 },
    por_pessoa: [person],
    por_setor: [],
    fora_do_prazo: [],
  },
});

describe('Gestão — erros (B5)', () => {
  afterEach(() => cleanup());
  beforeEach(() => refetch.mockClear());

  it('erro de rede mostra "tentar de novo", não "acesso restrito"', () => {
    overview = { isLoading: false, isError: true, error: new TypeError('Failed to fetch'), data: undefined, refetch };
    renderGestao();
    expect(screen.queryByText(/Acesso restrito/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('erro de permissão da RPC mostra acesso restrito', () => {
    overview = {
      isLoading: false,
      isError: true,
      error: { code: 'P0001', message: 'Acesso restrito a administradores.' },
      data: undefined,
      refetch,
    };
    renderGestao();
    expect(screen.getByText(/Acesso restrito/)).toBeInTheDocument();
  });
});

describe('Gestão — pagamento por pessoa (uso-real-3)', () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    rpc.mockClear();
    overview = okOverview();
  });

  it('não reembolsável fica fora do valor e dos ids enviados à RPC', async () => {
    renderGestao();
    fireEvent.click(screen.getByText('Bia'));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Não reembolsável')).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: /Confirmar pagamento/ });
    expect(confirm.textContent).toMatch(/R\$\s?30,00/);
    expect(within(dialog).getByText(/a pagar R\$\s?30,00/)).toBeInTheDocument();

    fireEvent.click(confirm);
    fireEvent.click(within(dialog).getByRole('button', { name: /Sim, pagar R\$\s?30,00/ }));
    await vi.waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('mark_expenses_paid', { p_expense_ids: ['a'] }),
    );
  });
});
