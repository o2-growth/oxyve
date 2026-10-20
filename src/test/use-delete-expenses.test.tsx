/** E6(b) — exclusão em lote avisa quando a RLS deixou parte das despesas para trás. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const deleted = vi.hoisted(() => ({ rows: [] as { id: string }[] }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));

vi.mock('sonner', () => ({ toast }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      delete: () => ({
        in: () => ({ select: () => Promise.resolve({ data: deleted.rows, error: null }) }),
      }),
    }),
  },
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: { id: 'u1', org_id: 'o1' } }),
}));

import { useDeleteExpenses } from '@/hooks/useExpenses';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('useDeleteExpenses', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tudo excluído: sucesso', async () => {
    deleted.rows = [{ id: 'a' }, { id: 'b' }];
    const { result } = renderHook(() => useDeleteExpenses(), { wrapper });
    await act(() => result.current.mutateAsync(['a', 'b']));
    expect(toast.success).toHaveBeenCalled();
  });

  it('parte excluída: avisa em vez de dizer que excluiu tudo', async () => {
    deleted.rows = [{ id: 'a' }];
    const { result } = renderHook(() => useDeleteExpenses(), { wrapper });
    await act(() => result.current.mutateAsync(['a', 'b']));
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/1 de 2/));
  });

  it('nada excluído: erro', async () => {
    deleted.rows = [];
    const { result } = renderHook(() => useDeleteExpenses(), { wrapper });
    await act(() => result.current.mutateAsync(['b']));
    expect(toast.error).toHaveBeenCalled();
  });
});
