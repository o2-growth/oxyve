/**
 * Tela Despesas — seleção em lote só com despesas próprias, "Adicionar a relatório"
 * individual independente da seleção, "Ver comprovante" e o atalho ?new=1.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Expense } from '@/hooks/useExpenses';

const isMobile = vi.hoisted(() => ({ value: false }));
const addToReportProps = vi.hoisted(() => vi.fn());
const formProps = vi.hoisted(() => vi.fn());
const receiptProps = vi.hoisted(() => vi.fn());

const expense = (over: Partial<Expense>): Expense =>
  ({
    id: 'x',
    org_id: 'o1',
    user_id: 'me',
    date: '2026-10-10',
    description: 'Despesa',
    category_id: null,
    amount_cents: 1000,
    currency: 'BRL',
    payment_method: 'personal_card',
    is_reimbursable: true,
    status: 'draft',
    receipt_path: null,
    notes: null,
    cost_center_id: null,
    project_id: null,
    is_out_of_policy: false,
    is_event: false,
    distance_km: null,
    reimbursable_cents: null,
    food_days: 1,
    late_decision: null,
    created_at: '',
    updated_at: '',
    report: null,
    ...over,
  }) as Expense;

const list = vi.hoisted(() => ({ rows: [] as Expense[] }));

vi.mock('@/components/layout/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => isMobile.value }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me' }, profile: { id: 'me', org_id: 'o1' }, isManager: true }),
}));
vi.mock('@/hooks/useExpenses', () => ({
  useExpenses: () => ({ data: list.rows, isLoading: false }),
  useExpenseCounts: () => ({ data: undefined }),
  useDeleteExpense: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteExpenses: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/components/expenses/ExpenseFiltersPopover', () => ({ ExpenseFiltersPopover: () => null }));
vi.mock('@/components/expenses/MultiDayExpenseDialog', () => ({ MultiDayExpenseDialog: () => null }));
vi.mock('@/components/expenses/ExpenseFormDialog', () => ({
  ExpenseFormDialog: (p: { open: boolean }) => {
    formProps(p);
    return p.open ? <div data-testid="expense-form-open" /> : null;
  },
}));
vi.mock('@/components/expenses/AddToReportDialog', () => ({
  AddToReportDialog: (p: unknown) => {
    addToReportProps(p);
    return null;
  },
}));
vi.mock('@/components/reports/ReceiptPreviewDialog', () => ({
  ReceiptPreviewDialog: (p: unknown) => {
    receiptProps(p);
    return null;
  },
}));

import Expenses from '@/pages/app/Expenses';

const renderPage = (url = '/app/expenses') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Expenses />
    </MemoryRouter>,
  );

const lastAddProps = () => addToReportProps.mock.calls.at(-1)?.[0] as { open: boolean; expense: Expense | null; expenseIds?: string[] };

describe('Despesas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMobile.value = false;
    list.rows = [
      expense({ id: 'm1', description: 'Minha 1' }),
      expense({ id: 'm2', description: 'Minha 2' }),
      expense({ id: 'm3', description: 'Minha 3', receipt_path: 'o1/me/r/m3/1.jpg' }),
      expense({ id: 'o1', description: 'Do colega', user_id: 'other' }),
    ];
  });

  afterEach(() => cleanup());

  it('selecionar todas pega só as despesas próprias', () => {
    renderPage();
    fireEvent.click(screen.getByLabelText('Selecionar todas'));
    expect(screen.getByLabelText('Selecionar despesa Do colega')).toBeDisabled();
    expect(screen.getByText('Adicionar a relatório (3)')).toBeInTheDocument();
  });

  it('com despesa de colega não há ação em lote', () => {
    renderPage();
    // Checkbox desabilitado não seleciona.
    fireEvent.click(screen.getByLabelText('Selecionar despesa Do colega'));
    expect(screen.queryByText(/Adicionar a relatório \(/)).toBeNull();
  });

  it('avulsa com decisão pendente do gestor não libera "adicionar" em lote', () => {
    list.rows = [expense({ id: 'p1', description: 'Pendente', late_decision: 'pending' })];
    renderPage();
    fireEvent.click(screen.getByLabelText('Selecionar despesa Pendente'));
    expect(screen.queryByText(/Adicionar a relatório \(/)).toBeNull();
    // Header e barra do celular (o CSS md:hidden não roda no jsdom).
    expect(screen.getAllByText('Excluir (1)').length).toBeGreaterThan(0);
  });

  it('botão de lote manda os ids selecionados', () => {
    renderPage();
    fireEvent.click(screen.getByLabelText('Selecionar despesa Minha 1'));
    fireEvent.click(screen.getByLabelText('Selecionar despesa Minha 2'));
    fireEvent.click(screen.getByText('Adicionar a relatório (2)'));
    expect(lastAddProps()).toMatchObject({ open: true, expense: null, expenseIds: ['m1', 'm2'] });
  });

  it('"Ver comprovante" abre o diálogo com o caminho do arquivo', () => {
    renderPage();
    fireEvent.click(screen.getByTitle('Ver comprovante'));
    expect(receiptProps.mock.calls.at(-1)?.[0]).toMatchObject({ path: 'o1/me/r/m3/1.jpg', title: 'Minha 3' });
  });

  it('atalho ?new=1 abre o formulário de nova despesa', () => {
    renderPage('/app/expenses?new=1');
    expect(screen.getByTestId('expense-form-open')).toBeInTheDocument();
  });

  it('celular: "Adicionar a Relatório" do card usa a despesa clicada, não a seleção', () => {
    isMobile.value = true;
    renderPage();
    fireEvent.click(screen.getByLabelText('Selecionar Minha 1'));
    fireEvent.click(screen.getByLabelText('Selecionar Minha 2'));
    // Menu do card "Minha 3"
    const trigger = screen.getAllByLabelText('Ações da despesa')[2];
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(screen.getByText('Adicionar a Relatório'));
    expect(lastAddProps()).toMatchObject({ open: true, expenseIds: undefined });
    expect(lastAddProps().expense?.id).toBe('m3');
  });

  it('celular mostra "Nova despesa" e "Vários dias"', () => {
    isMobile.value = true;
    renderPage();
    expect(screen.getByText('Nova despesa')).toBeInTheDocument();
    expect(screen.getAllByText('Vários dias').length).toBeGreaterThan(0);
  });
});
