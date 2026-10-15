/**
 * dinheiro-datas-9 / uso-real-12: relatório devolvido (rascunho com motivo)
 * ganha selo "Devolvido" e a aba "Devolvidos" lista esses relatórios.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Report } from '@/hooks/useReports';

const base = {
  org_id: 'o1',
  user_id: 'me',
  start_date: '2026-10-01',
  end_date: '2026-10-31',
  created_at: '2026-10-01',
  updated_at: '2026-10-01',
  total_cents: 1000,
  reimbursable_cents: 1000,
  expense_count: 1,
};
const all: Report[] = [
  { ...base, id: 'a', title: 'Devolvido Set', status: 'draft', last_rejection_comment: 'Falta a nota do Uber' },
  { ...base, id: 'b', title: 'Aberto Out', status: 'draft', last_rejection_comment: null },
  { ...base, id: 'c', title: 'Enviado Ago', status: 'submitted', last_rejection_comment: null },
];
const statusesAsked: Array<string | undefined> = [];

vi.mock('@/hooks/useReports', () => ({
  useReports: (f?: { status?: string }) => {
    statusesAsked.push(f?.status);
    const data = !f?.status || f.status === 'all' ? all : all.filter((r) => r.status === f.status);
    return { data, isLoading: false, isError: false, refetch: vi.fn() };
  },
  useDeleteReport: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isManager: false, profile: { id: 'me', org_id: 'o1' } }),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => true }));
vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/reports/ReportFormDialog', () => ({ ReportFormDialog: () => null }));
vi.mock('@/components/reports/ApprovalQueue', () => ({ ApprovalQueue: () => null }));

import Reports from '@/pages/app/Reports';

function renderAt(url: string) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Reports />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Relatórios — devolvidos', () => {
  afterEach(() => {
    cleanup();
    statusesAsked.length = 0;
  });

  it('lista geral marca o devolvido com selo', () => {
    renderAt('/app/reports');
    const card = screen.getByText('Devolvido Set').closest('a') as HTMLElement;
    expect(within(card).getByText('Devolvido')).toBeInTheDocument();
    const other = screen.getByText('Aberto Out').closest('a') as HTMLElement;
    expect(within(other).queryByText('Devolvido')).toBeNull();
  });

  it('aba Devolvidos lista só os devolvidos e conta certo', () => {
    renderAt('/app/reports?status=returned');
    expect(screen.getByText('Devolvido Set')).toBeInTheDocument();
    expect(screen.queryByText('Aberto Out')).toBeNull();
    expect(screen.queryByText('Enviado Ago')).toBeNull();
    const tab = screen.getByRole('tab', { name: /Devolvidos/ });
    expect(tab.textContent).toMatch(/1$/);
    // "returned" não é status do banco: a consulta vai sem filtro de status.
    expect(statusesAsked).not.toContain('returned');
  });

  it('link antigo ?status=rejected cai em Devolvidos', () => {
    renderAt('/app/reports?status=rejected');
    expect(screen.getByRole('tab', { name: /Devolvidos/ })).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('Devolvido Set')).toBeInTheDocument();
  });
});
