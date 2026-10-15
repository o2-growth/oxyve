/**
 * Decisão 4: ao marcar o relatório como pago, o admin vê o PIX e o banco de quem
 * recebe no próprio diálogo de confirmação (igual ao pagamento por pessoa da Gestão).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

const mutateAsync = vi.fn().mockResolvedValue({});
const markPaid = vi.fn().mockResolvedValue({});

const report: { status: string; user: Record<string, string | null> } & Record<string, unknown> = {
  id: 'r1',
  user_id: 'author',
  title: 'Relatório Out 2026',
  status: 'approved',
  total_cents: 11000,
  user: {
    full_name: 'Bia',
    pix_key: 'bia@exemplo.com',
    pix_key_type: 'email',
    bank_name: 'Banco X',
    bank_branch: '0001',
    bank_account: '12345-6',
  },
  approvals: [],
  items: [
    {
      id: 'i1',
      review_decision: 'approved',
      review_comment: null,
      expense: { id: 'e1', date: '2026-10-05', description: 'Almoço', amount_cents: 6000, is_reimbursable: true, currency: 'BRL' },
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
  useMarkReportPaidRpc: () => ({ mutateAsync: markPaid, isPending: false }),
}));
vi.mock('@/hooks/useReviewExpense', () => ({
  useReviewExpense: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/usePolicy', () => ({
  useExpensePolicy: () => ({ data: { food_daily_limit_cents: 3500 } }),
}));
vi.mock('@/hooks/useReportEvents', () => ({ useReportEvents: () => ({ data: [] }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'boss' }, isManager: true, isAdmin: true }),
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

describe('ReportDetail — pagamento pelo admin', () => {
  afterEach(() => cleanup());

  it('diálogo de pagamento mostra PIX e banco de quem recebe', async () => {
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: /Marcar como pago/ }));
    const dialog = await screen.findByRole('alertdialog');
    const details = within(dialog).getByTestId('payment-details');
    expect(details).toHaveTextContent('PIX (E-mail): bia@exemplo.com');
    expect(details).toHaveTextContent('Banco X · Ag. 0001 · Conta 12345-6');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar pagamento' }));
    expect(markPaid).toHaveBeenCalledWith('r1');
  });

  it('sem dados cadastrados avisa no diálogo, sem travar o pagamento', async () => {
    report.user = { full_name: 'Bia', pix_key: null, bank_name: null };
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: /Marcar como pago/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByTestId('payment-details')).toHaveTextContent(
      'Pessoa sem dados de pagamento cadastrados.',
    );
    expect(within(dialog).getByRole('button', { name: 'Confirmar pagamento' })).not.toBeDisabled();
  });
});
