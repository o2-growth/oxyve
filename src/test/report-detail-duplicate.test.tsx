/**
 * Decisão 3: no Detalhe, item marcado pelo banco como possível duplicidade ganha
 * selo (com a outra despesa na dica) e o resumo/diálogo de aprovação avisa. Não
 * bloqueia: com tudo revisado, Aprovar continua liberado.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

const mutateAsync = vi.fn().mockResolvedValue({});

const report = {
  id: 'r1',
  user_id: 'author',
  title: 'Relatório Out 2026',
  status: 'submitted',
  total_cents: 11000,
  user: { full_name: 'Bia' },
  approvals: [],
  items: [
    {
      id: 'i1',
      review_decision: 'approved',
      review_comment: null,
      expense: { id: 'e1', date: '2026-10-05', description: 'Almoço', amount_cents: 6000, is_reimbursable: true, currency: 'BRL', receipt_date: '2026-09-21' },
    },
    {
      id: 'i2',
      review_decision: 'approved',
      review_comment: null,
      expense: {
        id: 'e2',
        date: '2026-10-05',
        description: 'Almoço de novo',
        amount_cents: 6000,
        is_reimbursable: true,
        currency: 'BRL',
        possible_duplicate_of: 'e1',
        duplicate_of: { id: 'e1', date: '2026-10-05', description: 'Almoço' },
      },
    },
  ],
};

vi.mock('@/integrations/supabase/client', () => {
  const rules = [
    { id: 'e1', reimbursable_cents: 3500, food_days: 1, is_event: false, is_out_of_policy: false, notes: null, late_decision: null },
    { id: 'e2', reimbursable_cents: 5000, food_days: 1, is_event: false, is_out_of_policy: false, notes: null, late_decision: null },
  ];
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.in = () => Promise.resolve({ data: rules, error: null });
  return { supabase: { from: () => chain } };
});
vi.mock('@/hooks/useReports', () => ({
  useReport: () => ({ data: report, isLoading: false }),
  useRemoveExpenseFromReport: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useCurrentReport', () => ({
  useSubmitReportRpc: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useReportActions', () => ({
  useApproveReportRpc: () => ({ mutateAsync, isPending: false }),
  useMarkReportPaidRpc: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useReviewExpense', () => ({
  useReviewExpense: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/usePolicy', () => ({
  useExpensePolicy: () => ({ data: { food_daily_limit_cents: 3500 } }),
}));
vi.mock('@/hooks/useReportEvents', () => ({ useReportEvents: () => ({ data: [] }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'boss' }, isManager: true, isAdmin: false }),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/reports/ReportHistory', () => ({ ReportHistory: () => null }));
vi.mock('@/components/reports/ReceiptPreviewDialog', () => ({ ReceiptPreviewDialog: () => null }));

const downloadReportCsv = vi.fn();
vi.mock('@/lib/exportReport', () => ({ downloadReportCsv: (r: unknown) => downloadReportCsv(r) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ReportDetail from '@/pages/app/ReportDetail';

function renderDetail() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <MemoryRouter initialEntries={['/app/reports/r1']}>
          <Routes>
            <Route path="/app/reports/:id" element={<ReportDetail />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('ReportDetail — possível duplicidade', () => {
  afterEach(() => cleanup());

  it('data da nota diferente: selo âmbar com a dica só no item que difere', async () => {
    renderDetail();
    const badges = await screen.findAllByTestId('receipt-date-mismatch-badge');
    // Linha da tabela e card mobile do mesmo item.
    expect(new Set(badges.map((b) => b.getAttribute('title')))).toEqual(
      new Set(['Nota de 21/09/2026 · despesa em 05/10/2026']),
    );
    expect(badges[0]).toHaveTextContent('Data da nota diferente');
  });

  it('selo só no item marcado e aviso no resumo', async () => {
    renderDetail();
    const badges = await screen.findAllByTestId('possible-duplicate-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent('Possível duplicidade');
    expect(screen.getByTestId('possible-duplicate-summary')).toHaveTextContent(
      '1 despesa com possível duplicidade — confira antes de aprovar.',
    );
  });

  it('não bloqueia: Aprovar liberado e o diálogo repete o aviso', async () => {
    renderDetail();
    const approve = screen.getByRole('button', { name: /Aprovar relatório/ });
    expect(approve).not.toBeDisabled();
    fireEvent.click(approve);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('possible-duplicate-summary')).toBeInTheDocument();
  });
});
