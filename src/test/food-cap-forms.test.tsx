/**
 * Teto de alimentação nos formulários: nota lida de R$ 70 vira R$ 30 no campo,
 * a nota aparece como referência e a leitura não acusa divergência por causa do teto.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { format } from 'date-fns';
import type { ReactNode } from 'react';

const today = format(new Date(), 'yyyy-MM-dd');

const invoke = vi.hoisted(() => vi.fn());
const mutateAsync = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke }, from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: { id: 'u1', org_id: 'o1' } }),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
// Mesma referência a cada render, como o react-query (array novo realimentava o form).
const categories = vi.hoisted(() => ({
  data: [
    { id: 'food1', name: 'Almoço', kind: 'food', sector: 'Comercial', is_active: true },
    { id: 'park1', name: 'Estacionamento', kind: 'transport', sector: 'Comercial', is_active: true },
  ],
}));
vi.mock('@/hooks/useExpenseTypes', () => ({ useActiveExpenseTypes: () => categories }));
const policy = vi.hoisted(() => ({
  data: { food_daily_limit_cents: 3000, require_receipt: false, require_project: false, cycle_cutoff_day: 24 },
}));
vi.mock('@/hooks/usePolicy', () => ({
  useExpensePolicy: () => policy,
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
const attachReceipt = vi.hoisted(() => vi.fn());
vi.mock('@/lib/receipts', () => ({
  attachReceipt,
  receiptFileProblem: vi.fn().mockResolvedValue(null),
  receiptHash: vi.fn().mockResolvedValue('hash'),
}));
vi.mock('@/lib/convertHeic', () => ({ convertHeicToJpeg: (f: File) => Promise.resolve(f) }));
vi.mock('@/lib/receiptImage', () => ({
  prepareImageForOcr: () => Promise.resolve({ base64: 'YWJj', mimeType: 'image/jpeg' }),
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: ReactNode }) => (
    <select data-testid="native-select" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="" />
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectGroup: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectLabel: () => null,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));

class FileReaderStub {
  result: string | null = null;
  onload: (() => void) | null = null;
  onloadend: (() => void) | null = null;
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

import { ExpenseFormDialog } from '@/components/expenses/ExpenseFormDialog';
import { QuickExpenseSheet } from '@/components/expenses/QuickExpenseSheet';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s/g, ' ');

const reading = (cents: number) => ({
  data: {
    extracted_date: today,
    extracted_amount_cents: cents,
    extracted_cnpj: '11222333000181',
    extracted_supplier: 'Restaurante',
    receipt_type: 'nota_fiscal',
    confidence: 'high',
    amount_confidence: 'high',
    date_confidence: 'high',
    issues: [],
  },
  error: null,
});

function categorySelect(): HTMLSelectElement {
  return screen
    .getAllByTestId('native-select')
    .find((s) => s.querySelector('option[value="food1"]')) as HTMLSelectElement;
}

describe('ExpenseFormDialog — teto de alimentação no campo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invoke.mockResolvedValue(reading(7000));
  });
  afterEach(() => cleanup());

  it('nota lida de 70 em almoço → campo 30, nota de referência e sem divergência', { timeout: 10_000 }, async () => {
    const { container } = render(<ExpenseFormDialog open onOpenChange={() => {}} useCurrentReportFlow />, { wrapper });
    fireEvent.change(categorySelect(), { target: { value: 'food1' } });
    const input = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['abc'], 'nota.jpg', { type: 'image/jpeg' })] } });
    });
    const amount = screen.getByTestId('expense-amount-input') as HTMLInputElement;
    await waitFor(() => expect(amount.value).toBe('30,00'));
    expect(text(screen.getByTestId('food-cap-note'))).toContain('Nota: R$ 70,00 · lançado até o teto de R$ 30,00/dia. Você pode alterar.');

    // Revalidação (debounce) compara a leitura com a nota, não com o lançado.
    await wait(1200);
    expect(screen.queryByText(/Valor no comprovante/)).toBeNull();

    // Troca para não-alimentação: valor = nota.
    fireEvent.change(categorySelect(), { target: { value: 'park1' } });
    await waitFor(() => expect(amount.value).toBe('70,00'));
    // Volta para alimentação: recalcula.
    fireEvent.change(categorySelect(), { target: { value: 'food1' } });
    await waitFor(() => expect(amount.value).toBe('30,00'));
  });

  it('subir acima do teto mostra o aviso e mantém o valor digitado', async () => {
    render(<ExpenseFormDialog open onOpenChange={() => {}} useCurrentReportFlow />, { wrapper });
    fireEvent.change(categorySelect(), { target: { value: 'food1' } });
    const amount = screen.getByTestId('expense-amount-input') as HTMLInputElement;
    fireEvent.change(amount, { target: { value: '70' } });
    fireEvent.blur(amount);
    await waitFor(() => expect(amount.value).toBe('30,00'));
    fireEvent.change(amount, { target: { value: '45' } });
    fireEvent.blur(amount);
    await waitFor(() => expect(amount.value).toBe('45,00'));
    expect(text(screen.getByTestId('food-cap-over'))).toBe('Acima do teto: será reembolsado até R$ 30,00/dia');
  });

  it('nota de 22 fica 22, sem frase de teto', async () => {
    render(<ExpenseFormDialog open onOpenChange={() => {}} useCurrentReportFlow />, { wrapper });
    fireEvent.change(categorySelect(), { target: { value: 'food1' } });
    const amount = screen.getByTestId('expense-amount-input') as HTMLInputElement;
    fireEvent.change(amount, { target: { value: '22' } });
    fireEvent.blur(amount);
    await waitFor(() => expect(amount.value).toBe('22,00'));
    expect(screen.queryByTestId('food-cap-note')).toBeNull();
    expect(screen.queryByTestId('food-cap-over')).toBeNull();
  });
});

describe('QuickExpenseSheet — teto de alimentação', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invoke.mockResolvedValue(reading(7000));
    mutateAsync.mockResolvedValue({ expense: { id: 'e1' }, report: { id: 'r1' } });
  });
  afterEach(() => cleanup());

  async function photo() {
    const input = screen.getByTestId('quick-expense-file-input') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['abc'], 'nota.jpg', { type: 'image/jpeg' })] } });
    });
    await waitFor(() => expect(screen.queryByText('Analisando comprovante...')).toBeNull());
    await waitFor(() => expect(screen.getByTestId('step-review')).toBeInTheDocument());
  }

  it('salvar rápido grava o lançado (30) e mostra a nota de referência', async () => {
    render(<QuickExpenseSheet open onOpenChange={() => {}} />, { wrapper });
    await photo();
    fireEvent.change(categorySelect(), { target: { value: 'food1' } });
    expect(text(screen.getByTestId('food-cap-note'))).toContain('Nota: R$ 70,00 · lançado até o teto de R$ 30,00/dia');
    await act(async () => {
      fireEvent.click(screen.getByTestId('quick-save-btn'));
    });
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ amount_cents: 3000 })));
  });

  it('editar detalhes: campo 30; evento volta para a nota', async () => {
    render(<QuickExpenseSheet open onOpenChange={() => {}} />, { wrapper });
    await photo();
    fireEvent.change(categorySelect(), { target: { value: 'food1' } });
    fireEvent.click(screen.getByTestId('edit-details-btn'));
    const amount = (await screen.findByTestId('quick-amount-input')) as HTMLInputElement;
    expect(amount.value).toBe('30,00');
    fireEvent.click(screen.getByTestId('quick-event-switch'));
    await waitFor(() => expect(amount.value).toBe('70,00'));
  });

  it('nota fora da janela de 20 dias: salva com a data de hoje, avisa e guarda a data da nota', async () => {
    const old = format(new Date(Date.now() - 29 * 86400000), 'yyyy-MM-dd');
    invoke.mockResolvedValue({ ...reading(2500), data: { ...reading(2500).data, extracted_date: old } });
    attachReceipt.mockResolvedValue('path');
    render(<QuickExpenseSheet open onOpenChange={() => {}} />, { wrapper });
    await photo();
    expect(screen.getByTestId('receipt-date-notice')).toHaveTextContent(/fora da janela de 20 dias/);
    fireEvent.change(categorySelect(), { target: { value: 'park1' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('quick-save-btn'));
    });
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ date: today })));
    await waitFor(() => expect(attachReceipt).toHaveBeenCalledWith(expect.objectContaining({ receiptDate: old })));
  });

  it('categoria não-alimentação salva o valor da nota', async () => {
    render(<QuickExpenseSheet open onOpenChange={() => {}} />, { wrapper });
    await photo();
    fireEvent.change(categorySelect(), { target: { value: 'park1' } });
    expect(screen.queryByTestId('food-cap-note')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId('quick-save-btn'));
    });
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ amount_cents: 7000 })));
  });
});
