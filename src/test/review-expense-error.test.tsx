/**
 * uso-real-8: revisão de item bloqueada pela RLS (revisão de outro aprovador)
 * mostra mensagem humana; outros erros seguem com o texto do servidor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

let nextError: { code?: string; message: string } | null = null;
const toastError = vi.fn();

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  chain.upsert = () => chain;
  chain.select = () => chain;
  chain.single = () => Promise.resolve({ data: null, error: nextError });
  return { supabase: { from: () => chain } };
});
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { id: 'u1' } }) }));
vi.mock('sonner', () => ({ toast: { error: (m: string) => toastError(m), success: vi.fn() } }));

import { useReviewExpense } from '@/hooks/useReviewExpense';

function run() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useReviewExpense(), { wrapper });
  return act(async () => {
    await result.current
      .mutateAsync({ expenseId: 'e1', reportId: 'r1', decision: 'approved' })
      .catch(() => undefined);
  });
}

describe('useReviewExpense — erros', () => {
  beforeEach(() => toastError.mockClear());

  it('RLS vira mensagem humana', async () => {
    nextError = { code: '42501', message: 'new row violates row-level security policy for table "expense_reviews"' };
    await run();
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/Outro aprovador já revisou/));
    expect(toastError.mock.calls[0][0]).not.toMatch(/row-level/);
  });

  it('outro erro mostra a mensagem do servidor', async () => {
    nextError = { code: '08006', message: 'connection failure' };
    await run();
    expect(toastError).toHaveBeenCalledWith('Erro ao salvar revisão: connection failure');
  });
});

describe('useReviewExpense — sucesso', () => {
  it('invalida também a lista de relatórios (a Fila decide pela revisão)', async () => {
    nextError = null;
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useReviewExpense(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ expenseId: 'e1', reportId: 'r1', decision: 'approved' });
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['report', 'r1'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['reports'] });
  });
});
