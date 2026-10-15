/**
 * ReportDetail: "Reprovar relatório" já vem com os itens reprovados na revisão,
 * motivo só com espaços não passa e o teto exibido vem da política.
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
      expense: { id: 'e1', date: '2026-10-05', description: 'Almoço', amount_cents: 6000, is_reimbursable: true, currency: 'BRL' },
    },
    {
      id: 'i2',
      review_decision: 'rejected',
      review_comment: 'Nota ilegível',
      expense: { id: 'e2', date: '2026-10-06', description: 'Uber', amount_cents: 5000, is_reimbursable: true, currency: 'BRL' },
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

describe('ReportDetail — reprovar relatório', () => {
  afterEach(() => cleanup());

  it('pré-preenche com os itens reprovados e envia o texto sem espaços', async () => {
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /Reprovar relatório/ }));
    const dialog = await screen.findByRole('dialog');
    const textarea = within(dialog).getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toContain('• Uber (06/10/2026): Nota ilegível');
    expect(textarea.value).not.toContain('Almoço');

    const submit = within(dialog).getByRole('button', { name: /Reprovar e devolver/ });
    fireEvent.change(textarea, { target: { value: '   ' } });
    expect(submit).toBeDisabled();
    expect(within(dialog).getByText('Informe o motivo da reprovação')).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: ' Corrigir o Uber ' } });
    fireEvent.click(submit);
    await vi.waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ reportId: 'r1', decision: 'rejected', comment: 'Corrigir o Uber' }),
    );
  });

  it('teto de alimentação no resumo vem da política', async () => {
    renderDetail();
    const items = await screen.findAllByText(/acima do teto de alimentação/);
    expect(items[0].textContent).toMatch(/R\$\s?35,00\/dia/);
    expect(document.body.textContent).not.toMatch(/R\$\s?30\/dia/);
  });
});
