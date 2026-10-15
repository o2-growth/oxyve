/** B4 — gestor só vê os próprios rascunhos ao adicionar despesa a relatório. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me' }, profile: { id: 'me', org_id: 'o1' }, isManager: true }),
}));
vi.mock('@/hooks/useReports', () => ({
  useReports: () => ({
    data: [
      { id: 'r-me', user_id: 'me', title: 'Meu relatório', expense_count: 1, total_cents: 100 },
      { id: 'r-x', user_id: 'other', title: 'Relatório do colega', expense_count: 2, total_cents: 200 },
    ],
    isLoading: false,
  }),
  useCreateReport: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddExpenseToReport: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddExpensesToReport: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { AddToReportDialog } from '@/components/expenses/AddToReportDialog';

describe('AddToReportDialog', () => {
  afterEach(() => cleanup());

  it('lista só os rascunhos do próprio usuário', () => {
    render(<AddToReportDialog open onOpenChange={() => {}} expenseIds={['e1']} />);
    expect(screen.getByText('Meu relatório')).toBeInTheDocument();
    expect(screen.queryByText('Relatório do colega')).toBeNull();
  });
});
