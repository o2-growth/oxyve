/**
 * Aria-2 smoke test: garante que `useReports` faz 1 query única em vez do
 * antigo padrão N+1 (1 + 2N selects).
 *
 * Estratégia: monkey-patch leve em `supabase.from(...)` retornando uma chain
 * mockada que conta quantas vezes `.from('reports')`, `.from('report_items')`
 * e `.from('profiles')` são chamados. Antes do fix: 1 reports + N items + N
 * profiles. Depois: apenas 1 select em reports (com nested resources).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Contadores compartilhados entre teste e mock.
const counters = {
  reports: 0,
  report_items: 0,
  profiles: 0,
};

// Mock do client retornando dados prontos (já com nested resources).
const mockReports = [
  {
    id: 'r1',
    org_id: 'o1',
    user_id: 'u1',
    title: 'R1',
    start_date: null,
    end_date: null,
    status: 'draft',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    user: { full_name: 'Alice' },
    items: [
      { expense: { amount_cents: 1000, is_reimbursable: true } },
      { expense: { amount_cents: 500, is_reimbursable: false } },
    ],
  },
  {
    id: 'r2',
    org_id: 'o1',
    user_id: 'u1',
    title: 'R2',
    start_date: null,
    end_date: null,
    status: 'submitted',
    created_at: '2026-01-02',
    updated_at: '2026-01-02',
    user: { full_name: 'Alice' },
    items: [],
  },
];

// Chain Supabase mock: from -> select -> order -> resolve com data.
function makeFromChain(table: string) {
  counters[table as keyof typeof counters] =
    (counters[table as keyof typeof counters] ?? 0) + 1;

  const result = {
    data: table === 'reports' ? mockReports : [],
    error: null,
  };

  const chain: Record<string, (...args: unknown[]) => unknown> = {
    select: () => chain,
    order: () => Promise.resolve(result),
    eq: () => chain,
    in: () => chain,
    single: () => Promise.resolve({ data: null, error: null }),
  };
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => makeFromChain(table),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'u1', org_id: 'o1' },
  }),
}));

import { useReports } from '@/hooks/useReports';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useReports — N+1 fix (Aria-2)', () => {
  beforeEach(() => {
    counters.reports = 0;
    counters.report_items = 0;
    counters.profiles = 0;
  });

  it('faz exatamente 1 query em reports e ZERO em report_items/profiles', async () => {
    const { result } = renderHook(() => useReports(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Reports = 1 (com nested select traz items + user numa só round-trip).
    expect(counters.reports).toBe(1);
    // O fix elimina queries extras de items/profiles do antes-N+1.
    expect(counters.report_items).toBe(0);
    expect(counters.profiles).toBe(0);

    // Sanity: dados foram derivados do nested resource corretamente.
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].total_cents).toBe(1500);
    expect(result.current.data?.[0].reimbursable_cents).toBe(1000);
    expect(result.current.data?.[0].expense_count).toBe(2);
    expect(result.current.data?.[0].user?.full_name).toBe('Alice');
  });
});
