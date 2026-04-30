/**
 * Sprint 2 — Dex: smoke test do hook useNotifications.
 * Mocka supabase + AuthContext, valida shape e que filtros são aplicados.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const mockRows = [
  {
    id: 'n1',
    user_id: 'u1',
    org_id: 'o1',
    category: 'action_required',
    title: 'Relatório aguardando',
    body: 'Detalhe',
    link: '/app/reports/abc',
    read_at: null,
    created_at: '2026-04-30T12:00:00.000Z',
  },
  {
    id: 'n2',
    user_id: 'u1',
    org_id: 'o1',
    category: 'my_expenses',
    title: 'Aprovado',
    body: null,
    link: null,
    read_at: '2026-04-30T13:00:00.000Z',
    created_at: '2026-04-30T11:00:00.000Z',
  },
];

const calls: { table: string; filters: Record<string, unknown>; isNull?: string; limit?: number }[] = [];

function makeQuery(table: string) {
  const state: { table: string; filters: Record<string, unknown>; isNull?: string; limit?: number } = {
    table,
    filters: {},
  };
  calls.push(state);

  const chain = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      state.filters[col] = val;
      return chain;
    },
    is: (col: string, val: unknown) => {
      if (val === null) state.isNull = col;
      return chain;
    },
    order: () => chain,
    limit: (n: number) => {
      state.limit = n;
      return Promise.resolve({ data: mockRows, error: null });
    },
    update: () => chain,
    in: () => chain,
    then: (resolve: (v: unknown) => unknown) => resolve({ data: mockRows, error: null }),
  };
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => makeQuery(table),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: { id: 'u1', org_id: 'o1' } }),
}));

import { useNotifications } from '@/hooks/useNotifications';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useNotifications', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('retorna shape NotificationRow[]', async () => {
    const { result } = renderHook(() => useNotifications({ limit: 10 }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0]).toMatchObject({
      id: 'n1',
      user_id: 'u1',
      category: 'action_required',
      title: expect.any(String),
    });
  });

  it('filtra por user_id e respeita limit', async () => {
    renderHook(() => useNotifications({ limit: 5 }), { wrapper });
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const call = calls.find((c) => c.table === 'notifications');
    expect(call?.filters.user_id).toBe('u1');
    expect(call?.limit).toBe(5);
  });

  it('aplica filtro de unreadOnly via .is(read_at, null)', async () => {
    renderHook(() => useNotifications({ unreadOnly: true }), { wrapper });
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const call = calls.find((c) => c.table === 'notifications' && c.isNull === 'read_at');
    expect(call).toBeTruthy();
  });

  it('aplica filtro de categoria', async () => {
    renderHook(() => useNotifications({ category: 'action_required' }), { wrapper });
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const call = calls.find(
      (c) => c.table === 'notifications' && c.filters.category === 'action_required'
    );
    expect(call).toBeTruthy();
  });
});
