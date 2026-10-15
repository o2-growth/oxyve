/**
 * E9: remover despesa do relatório precisa refazer também a lista de Despesas e
 * os contadores das abas — senão a despesa segue aparecendo vinculada.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  chain.delete = () => chain;
  chain.eq = (col: string) => (col === 'expense_id' ? Promise.resolve({ error: null }) : chain);
  return { supabase: { from: () => chain } };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'u1', org_id: 'o1' } }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useRemoveExpenseFromReport } from '@/hooks/useReports';

describe('useRemoveExpenseFromReport', () => {
  it('invalida relatório, listas de relatórios e de despesas', async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useRemoveExpenseFromReport(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ reportId: 'r1', expenseId: 'e1' });
    });

    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(['report', 'r1']));
    expect(keys).toContain(JSON.stringify(['reports']));
    expect(keys).toContain(JSON.stringify(['expenses']));
    expect(keys).toContain(JSON.stringify(['expense-counts']));
  });
});
