/**
 * ExpenseFormDialog — validação OCR sem loop e falha de upload do comprovante
 * depois que a despesa já foi criada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { format } from 'date-fns';
import type { ReactNode } from 'react';

const today = format(new Date(), 'yyyy-MM-dd');

const invoke = vi.hoisted(() => vi.fn());
const mutateAsync = vi.hoisted(() => vi.fn());
const attachReceipt = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn(), warning: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke }, from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: { id: 'u1', org_id: 'o1' } }),
}));

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

vi.mock('@/hooks/useExpenseTypes', () => ({ useActiveExpenseTypes: () => ({ data: [] }) }));

vi.mock('@/hooks/usePolicy', () => ({
  useExpensePolicy: () => ({ data: { require_receipt: false, require_project: false, cycle_cutoff_day: 24 } }),
  useActiveCostCenters: () => ({ data: [] }),
  useActiveProjects: () => ({ data: [] }),
}));

vi.mock('@/hooks/useExpenses', () => ({
  useCreateExpense: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateExpense: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useCurrentReport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useCurrentReport')>()),
  useDashboardContext: () => ({ data: undefined }),
  useReportForDate: () => ({ data: null, isFetched: true }),
  useCreateExpenseInReport: () => ({ mutateAsync, isPending: false }),
}));

vi.mock('@/lib/receipts', () => ({
  attachReceipt,
  receiptFileProblem: vi.fn().mockResolvedValue(null),
  receiptHash: vi.fn().mockResolvedValue('hash'),
}));

vi.mock('@/lib/convertHeic', () => ({ convertHeicToJpeg: (f: File) => Promise.resolve(f) }));

import { ExpenseFormDialog } from '@/components/expenses/ExpenseFormDialog';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

// FileReader do jsdom às vezes não completa leituras seguidas; um stub previsível
// deixa o teste medir só quantas vezes a validação dispara.
class FileReaderStub {
  result: string | null = null;
  onload: (() => void) | null = null;
  onloadend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  abort() {}
  readAsDataURL() {
    setTimeout(() => {
      this.result = 'data:image/jpeg;base64,YWJj';
      this.onload?.();
      this.onloadend?.();
    }, 0);
  }
}
vi.stubGlobal('FileReader', FileReaderStub);

const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

async function attachPhoto(container: HTMLElement) {
  const input = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['abc'], 'nota.jpg', { type: 'image/jpeg' });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

describe('ExpenseFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invoke.mockResolvedValue({
      data: {
        extracted_date: today,
        extracted_amount_cents: 5000,
        confidence: 'high',
        receipt_type: 'nota_fiscal',
        extracted_cnpj: '12345678000199',
      },
      error: null,
    });
  });

  afterEach(() => cleanup());

  it('não fica revalidando o comprovante em loop', { timeout: 15_000 }, async () => {
    const { container } = render(
      <ExpenseFormDialog open onOpenChange={() => {}} useCurrentReportFlow />,
      { wrapper },
    );
    await attachPhoto(container);
    await wait(3000);
    // Leitura inicial + no máximo uma revalidação depois do preenchimento automático.
    expect(invoke.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(invoke.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('se o comprovante não sobe depois de criar a despesa, fecha o diálogo e avisa', { timeout: 10_000 }, async () => {
    mutateAsync.mockResolvedValue({
      expense: { id: 'e1' },
      report: { id: 'r1', title: 'Relatório Out 2026' },
      is_out_of_policy: false,
    });
    attachReceipt.mockRejectedValue(new Error('network'));
    const onOpenChange = vi.fn();
    const { container } = render(
      <ExpenseFormDialog open onOpenChange={onOpenChange} useCurrentReportFlow />,
      { wrapper },
    );
    await attachPhoto(container);
    await wait(1500);

    await act(async () => {
      fireEvent.click(screen.getByText('Criar Despesa'));
    });

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(attachReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ reportId: 'r1', expenseId: 'e1', orgId: 'o1', userId: 'u1' }),
    );
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/sem comprovante/i), expect.anything());
  });

  it('comprovante que sobe depois de salvar atualiza a lista de despesas', { timeout: 10_000 }, async () => {
    mutateAsync.mockResolvedValue({ expense: { id: 'e1' }, report: { id: 'r1' }, is_out_of_policy: false });
    attachReceipt.mockResolvedValue('o1/u1/r1/e1/1.jpg');
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    const { container } = render(
      <QueryClientProvider client={qc}>
        <ExpenseFormDialog open onOpenChange={() => {}} useCurrentReportFlow />
      </QueryClientProvider>,
    );
    await attachPhoto(container);
    await wait(1500);
    await act(async () => {
      fireEvent.click(screen.getByText('Criar Despesa'));
    });
    await waitFor(() => expect(attachReceipt).toHaveBeenCalled());
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['expenses'] }));
  });

  it('data sem relatório do ciclo mostra o período e avisa que será criado ao salvar', () => {
    render(<ExpenseFormDialog open onOpenChange={() => {}} useCurrentReportFlow />, { wrapper });
    expect(screen.getByText(/será criado ao salvar/)).toBeInTheDocument();
  });
});
