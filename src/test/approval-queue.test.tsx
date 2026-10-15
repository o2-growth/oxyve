/**
 * Fila de aprovação: mesma regra do Detalhe (tudo revisado e nada reprovado)
 * para aprovar direto; o resto leva ao Detalhe. Lista sem o próprio relatório,
 * igual ao contador. Motivo só com espaços não reprova.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Report } from '@/hooks/useReports';

const mutateAsync = vi.fn().mockResolvedValue({});
const navigate = vi.fn();
let mockReports: Report[] = [];
let mobile = false;

vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
vi.mock('@/hooks/useReports', () => ({
  useReports: () => ({ data: mockReports, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock('@/hooks/useReportActions', () => ({
  useApproveReportRpc: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'me', org_id: 'o1' } }),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mobile }));

import { ApprovalQueue } from '@/components/reports/ApprovalQueue';

function report(over: Partial<Report>): Report {
  return {
    id: 'r',
    org_id: 'o1',
    user_id: 'other',
    title: 'Relatório',
    start_date: '2026-10-01',
    end_date: '2026-10-31',
    status: 'submitted',
    created_at: '2026-10-01',
    updated_at: '2026-10-01',
    total_cents: 9000,
    reimbursable_cents: 3000,
    expense_count: 2,
    review: { total: 2, reviewed: 2, rejected: 0 },
    rejected_items: [],
    user: { full_name: 'Bia' },
    ...over,
  };
}

const renderQueue = () =>
  render(
    <MemoryRouter>
      <ApprovalQueue />
    </MemoryRouter>,
  );

describe.each([false, true])('ApprovalQueue (mobile=%s)', (isMobile) => {
  beforeEach(() => {
    mobile = isMobile;
    mutateAsync.mockClear();
    navigate.mockClear();
  });
  afterEach(() => cleanup());

  it('não lista o próprio relatório', () => {
    mockReports = [
      report({ id: 'a', title: 'Do colega' }),
      report({ id: 'b', title: 'Meu', user_id: 'me' }),
    ];
    renderQueue();
    expect(screen.getAllByText('Do colega').length).toBeGreaterThan(0);
    expect(screen.queryByText('Meu')).toBeNull();
  });

  it('só o próprio relatório: fila vazia', () => {
    mockReports = [report({ id: 'b', title: 'Meu', user_id: 'me' })];
    renderQueue();
    expect(screen.getByText('Nenhum relatório pendente')).toBeInTheDocument();
  });

  it('sem revisão completa não oferece Aprovar; o botão leva ao Detalhe', () => {
    mockReports = [report({ id: 'a', title: 'Parcial', review: { total: 2, reviewed: 1, rejected: 0 } })];
    renderQueue();
    expect(screen.queryByRole('button', { name: /^Aprovar Parcial/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Reprovar Parcial/ })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: /Revisar despesas de Parcial/ })[0]);
    expect(navigate).toHaveBeenCalledWith('/app/reports/a');
  });

  it('com item reprovado na revisão não oferece Aprovar, só Reprovar', () => {
    mockReports = [report({ id: 'a', title: 'ComReprova', review: { total: 2, reviewed: 2, rejected: 1 } })];
    renderQueue();
    expect(screen.queryByRole('button', { name: /^Aprovar ComReprova/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Reprovar ComReprova/ })).toBeInTheDocument();
  });

  it('tudo revisado e aprovado: Aprovar envia a decisão com o valor a reembolsar', async () => {
    mockReports = [report({ id: 'a', title: 'Ok' })];
    renderQueue();
    fireEvent.click(screen.getByRole('button', { name: /^Aprovar Ok/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/R\$\s?30,00 a reembolsar/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aprovar' }));
    await vi.waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ reportId: 'a', decision: 'approved', comment: undefined }),
    );
  });

  it('reprovar: motivo só com espaços não habilita; pré-preenche itens reprovados', async () => {
    mockReports = [
      report({
        id: 'a',
        title: 'Dev',
        review: { total: 2, reviewed: 2, rejected: 1 },
        rejected_items: [{ description: 'Uber', date: '2026-10-06', comment: 'Sem nota' }],
      }),
    ];
    renderQueue();
    fireEvent.click(screen.getByRole('button', { name: /^Reprovar Dev/ }));
    const dialog = await screen.findByRole('dialog');
    const textarea = within(dialog).getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toContain('• Uber (06/10/2026): Sem nota');

    fireEvent.change(textarea, { target: { value: '   ' } });
    const submit = within(dialog).getByRole('button', { name: 'Reprovar' });
    expect(submit).toBeDisabled();

    fireEvent.change(textarea, { target: { value: '  Falta nota  ' } });
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);
    await vi.waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ reportId: 'a', decision: 'rejected', comment: 'Falta nota' }),
    );
  });

  it('relatório sem despesas não diz "Revisão completa" nem oferece decisão', () => {
    mockReports = [report({ id: 'a', title: 'Vazio', expense_count: 0, review: { total: 0, reviewed: 0, rejected: 0 } })];
    renderQueue();
    expect(screen.getByText('Sem despesas')).toBeInTheDocument();
    expect(screen.queryByText('Revisão completa')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Aprovar Vazio/ })).toBeNull();
  });
});
