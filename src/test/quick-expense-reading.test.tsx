/**
 * QuickExpenseSheet — leitura duvidosa da nota: confiável salva direto pelo
 * atalho; dúvida vai para a edição com os campos destacados; foto que não é
 * comprovante não preenche nada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import type { ReactNode } from 'react';

const readDate = format(subDays(new Date(), 2), 'yyyy-MM-dd');

const invoke = vi.hoisted(() => vi.fn());
const mutateAsync = vi.hoisted(() => vi.fn());
const toastWarning = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: toastWarning }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke }, from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: { id: 'u1', org_id: 'o1' } }),
}));

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

vi.mock('@/hooks/useExpenseTypes', () => ({
  useActiveExpenseTypes: () => ({
    data: [{ id: 'c1', name: 'Estacionamento', kind: 'transport', sector: 'Comercial' }],
  }),
}));

vi.mock('@/hooks/usePolicy', () => ({
  useExpensePolicy: () => ({ data: { food_daily_limit_cents: 3000 } }),
}));

vi.mock('@/hooks/useCurrentReport', () => ({
  useCreateExpenseInReport: () => ({ mutateAsync, isPending: false }),
}));

vi.mock('@/lib/receipts', () => ({
  attachReceipt: vi.fn().mockResolvedValue('path'),
  receiptFileProblem: vi.fn().mockResolvedValue(null),
  receiptHash: vi.fn().mockResolvedValue('hash'),
}));

vi.mock('@/lib/convertHeic', () => ({ convertHeicToJpeg: (f: File) => Promise.resolve(f) }));

vi.mock('@/lib/receiptImage', () => ({
  prepareImageForOcr: () => Promise.resolve({ base64: 'YWJj', mimeType: 'image/jpeg' }),
}));

// Select nativo no lugar do Radix: o teste é sobre a leitura, não sobre o popover.
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: ReactNode }) => (
    <select data-testid="category-native" value={value} onChange={(e) => onValueChange(e.target.value)}>
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

import { QuickExpenseSheet } from '@/components/expenses/QuickExpenseSheet';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const reliable = {
  extracted_date: readDate,
  extracted_amount_cents: 2500,
  extracted_cnpj: '11222333000181',
  extracted_supplier: 'Estapar',
  receipt_type: 'nota_fiscal',
  confidence: 'high',
  amount_confidence: 'high',
  date_confidence: 'high',
  issues: [],
  expense_kind_hint: 'transport',
  model_used: 'gpt-4o-mini',
};

async function photoAndCategory() {
  const input = screen.getByTestId('quick-expense-file-input') as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File(['abc'], 'nota.jpg', { type: 'image/jpeg' })] } });
  });
  await waitFor(() => expect(screen.getByTestId('step-review')).toBeInTheDocument());
  await waitFor(() => expect(invoke).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByText('Analisando comprovante...')).toBeNull());
  fireEvent.change(screen.getByTestId('category-native'), { target: { value: 'c1' } });
}

describe('QuickExpenseSheet — leitura duvidosa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockResolvedValue({ expense: { id: 'e1' }, report: { id: 'r1' } });
  });
  afterEach(() => cleanup());

  it('leitura confiável salva direto pelo atalho', async () => {
    invoke.mockResolvedValue({ data: reliable, error: null });
    const onOpenChange = vi.fn();
    render(<QuickExpenseSheet open onOpenChange={onOpenChange} />, { wrapper });
    await photoAndCategory();

    await act(async () => {
      fireEvent.click(screen.getByTestId('quick-save-btn'));
    });

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ amount_cents: 2500, date: readDate, description: 'Estapar', category_id: 'c1' }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByTestId('step-edit')).toBeNull();
  });

  it('valor com confiança baixa vai para a edição com o campo destacado, sem salvar', async () => {
    invoke.mockResolvedValue({
      data: { ...reliable, amount_confidence: 'low', issues: ['multiple_totals'], model_used: 'gpt-4o' },
      error: null,
    });
    render(<QuickExpenseSheet open onOpenChange={() => {}} />, { wrapper });
    await photoAndCategory();
    expect(screen.getByTestId('reading-issues')).toHaveTextContent('Mais de um total na nota — confira o valor');

    await act(async () => {
      fireEvent.click(screen.getByTestId('quick-save-btn'));
    });

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(toastWarning).toHaveBeenCalledWith(expect.stringMatching(/confira o valor e a data/));
    expect(screen.getByTestId('step-edit')).toBeInTheDocument();
    const amount = screen.getByTestId('quick-amount-input') as HTMLInputElement;
    expect(amount.value).toBe('25,00');
    expect(amount.className).toMatch(/status-event/);
    expect(screen.getByText('Confira o valor lido')).toBeInTheDocument();
    // Só o valor está em dúvida: a data não ganha destaque.
    expect(screen.queryByText('Confira a data lida')).toBeNull();

    // Corrigiu o valor: o destaque sai.
    fireEvent.change(amount, { target: { value: '30,00' } });
    await waitFor(() => expect(screen.queryByText('Confira o valor lido')).toBeNull());
  });

  it('data com confiança média também pede conferência', async () => {
    invoke.mockResolvedValue({ data: { ...reliable, date_confidence: 'medium' }, error: null });
    render(<QuickExpenseSheet open onOpenChange={() => {}} />, { wrapper });
    await photoAndCategory();
    await act(async () => {
      fireEvent.click(screen.getByTestId('quick-save-btn'));
    });
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText('Confira a data lida')).toBeInTheDocument();
    expect(screen.getByTestId('quick-date-btn').className).toMatch(/status-event/);
  });

  it('foto que não é comprovante avisa e não preenche nada', async () => {
    invoke.mockResolvedValue({
      data: { ...reliable, confidence: 'low', issues: ['not_a_receipt'] },
      error: null,
    });
    render(<QuickExpenseSheet open onOpenChange={() => {}} />, { wrapper });
    await photoAndCategory();
    expect(screen.getByTestId('not-a-receipt-warning')).toHaveTextContent('Isso não parece um comprovante');

    await act(async () => {
      fireEvent.click(screen.getByTestId('quick-save-btn'));
    });

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId('step-edit')).toBeInTheDocument();
    expect((screen.getByTestId('quick-amount-input') as HTMLInputElement).value).toBe('');
    expect(screen.queryByText('Confira o valor lido')).toBeNull();
  });
});
