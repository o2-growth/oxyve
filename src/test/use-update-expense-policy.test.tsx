/**
 * E3 — useUpdateExpensePolicy aplica a mudança no cache na hora (otimista) e
 * desfaz só os campos daquela chamada se o servidor recusar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

let resolveUpdate: (v: { data: unknown; error: unknown }) => void = () => {};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: () => ({
        eq: () => ({
          select: () => ({
            single: () =>
              new Promise((resolve) => {
                resolveUpdate = resolve;
              }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { org_id: 'o1' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useUpdateExpensePolicy, type ExpensePolicy } from '@/hooks/usePolicy';

const policy = {
  id: 'pol-1',
  require_project: false,
  require_receipt: false,
} as unknown as ExpensePolicy;

let qc: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(['expense-policy'], { ...policy });
});

describe('useUpdateExpensePolicy', () => {
  it('atualiza o cache antes da resposta do servidor', async () => {
    const { result } = renderHook(() => useUpdateExpensePolicy(), { wrapper });
    act(() => {
      result.current.mutate({ id: 'pol-1', require_project: true });
    });
    await waitFor(() =>
      expect(qc.getQueryData<ExpensePolicy>(['expense-policy'])?.require_project).toBe(true),
    );
    await act(async () => {
      resolveUpdate({ data: { ...policy, require_project: true }, error: null });
    });
  });

  it('no erro desfaz só o campo da chamada que falhou', async () => {
    const { result } = renderHook(() => useUpdateExpensePolicy(), { wrapper });
    act(() => {
      result.current.mutate({ id: 'pol-1', require_project: true });
    });
    await waitFor(() =>
      expect(qc.getQueryData<ExpensePolicy>(['expense-policy'])?.require_project).toBe(true),
    );
    // Outro campo mudou no meio do caminho (outra chamada otimista).
    qc.setQueryData<ExpensePolicy>(['expense-policy'], (old) => ({ ...old!, require_receipt: true }));

    await act(async () => {
      resolveUpdate({ data: null, error: { message: 'falhou' } });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const atual = qc.getQueryData<ExpensePolicy>(['expense-policy']);
    expect(atual?.require_project).toBe(false);
    expect(atual?.require_receipt).toBe(true);
  });
});
