/**
 * Decisão 3: mesma data+valor+categoria não bloqueia. O banco salva com
 * possible_duplicate_of e quem lança recebe um aviso claro (toast.warning).
 * Comprovante repetido continua bloqueado e o erro vem limpo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { rpc, single, toast } = vi.hoisted(() => ({
  rpc: vi.fn(),
  single: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  chain.insert = () => chain;
  chain.update = () => chain;
  chain.eq = () => chain;
  chain.select = () => chain;
  chain.single = () => single();
  return { supabase: { rpc: (...a: unknown[]) => rpc(...a), from: () => chain } };
});
vi.mock('sonner', () => ({ toast }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: { id: 'u1', org_id: 'o1' } }),
}));

import { useCreateExpenseInReport, useCreateExpenseMultiday } from '@/hooks/useCurrentReport';
import { useCreateExpense, useUpdateExpense } from '@/hooks/useExpenses';
import { possibleDuplicateHint, possibleDuplicateWarning } from '@/lib/possibleDuplicate';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const expense = {
  id: 'e2',
  description: 'Almoço',
  amount_cents: 3000,
  reimbursable_cents: 3000,
  date: '2026-10-10',
  is_out_of_policy: false,
};
const input = { description: 'Almoço', amount_cents: 3000, date: '2026-10-10' };

beforeEach(() => {
  rpc.mockReset();
  single.mockReset();
  Object.values(toast).forEach((f) => f.mockReset());
});

describe('textos', () => {
  it('aviso para quem lança diz que salvou e que o gestor verá', () => {
    expect(possibleDuplicateWarning(expense)).toMatch(
      /^Já existe uma despesa com mesma data, valor e categoria \(R\$\s?30,00 em 10\/10\/2026\) — ela foi salva e o gestor verá o alerta/,
    );
  });
  it('dica para o gestor aponta a outra despesa', () => {
    expect(possibleDuplicateHint({ description: 'Almoço', date: '2026-10-10' })).toBe(
      'Mesma data, valor e categoria de "Almoço" de 10/10/2026.',
    );
    expect(possibleDuplicateHint(null)).toMatch(/outra despesa da mesma pessoa/);
  });
});

describe('useCreateExpenseInReport', () => {
  it('possível duplicidade: aviso em vez do sucesso simples', async () => {
    rpc.mockResolvedValue({
      data: {
        expense: { ...expense, possible_duplicate_of: 'e1' },
        report: { title: 'Relatório Out 2026' },
        late: false,
        is_out_of_policy: false,
        possible_duplicate: true,
        possible_duplicate_of: 'e1',
      },
      error: null,
    });
    const { result } = renderHook(() => useCreateExpenseInReport(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(input);
    });
    expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/ela foi salva e o gestor verá o alerta/), expect.anything());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('sem duplicidade: sucesso com o relatório', async () => {
    rpc.mockResolvedValue({
      data: { expense, report: { title: 'Relatório Out 2026' }, is_out_of_policy: false, possible_duplicate: false, possible_duplicate_of: null },
      error: null,
    });
    const { result } = renderHook(() => useCreateExpenseInReport(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(input);
    });
    expect(toast.success).toHaveBeenCalledWith('Despesa adicionada ao Relatório Out 2026.');
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('comprovante repetido segue bloqueado e o erro aparece sem prefixo', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'Este comprovante já foi lançado em outra despesa. Se for outra nota, fotografe a nota correta.' },
    });
    const { result } = renderHook(() => useCreateExpenseInReport(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(input).catch(() => {});
    });
    expect(toast.error).toHaveBeenCalledWith(
      'Este comprovante já foi lançado em outra despesa. Se for outra nota, fotografe a nota correta.',
    );
  });
});

describe('useCreateExpenseMultiday', () => {
  it('conta os dias com possível duplicidade', async () => {
    rpc.mockResolvedValue({ data: { count: 3, expenses: [], possible_duplicates: 2 }, error: null });
    const { result } = renderHook(() => useCreateExpenseMultiday(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        description: 'Diária',
        amount_cents_per_day: 3000,
        start_date: '2026-10-08',
        end_date: '2026-10-10',
      });
    });
    expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/2 dias já tinham despesa com mesma data, valor e categoria/), expect.anything());
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe('useCreateExpense / useUpdateExpense (escrita direta)', () => {
  const payload = {
    date: '2026-10-10',
    description: 'Almoço',
    amount_cents: 3000,
    payment_method: 'personal_card' as const,
    is_reimbursable: true,
  };

  it('INSERT marcado pelo trigger avisa', async () => {
    single.mockResolvedValue({ data: { ...expense, possible_duplicate_of: 'e1' }, error: null });
    const { result } = renderHook(() => useCreateExpense(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(payload);
    });
    expect(toast.warning).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('edição sem coincidência: sucesso normal', async () => {
    single.mockResolvedValue({ data: { ...expense, possible_duplicate_of: null }, error: null });
    const { result } = renderHook(() => useUpdateExpense(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'e2', ...payload });
    });
    expect(toast.success).toHaveBeenCalledWith('Despesa atualizada!');
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
