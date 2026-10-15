/**
 * D2 — trocar a data no formulário não pode criar relatório: useReportForDate só lê
 * reports; a criação fica na RPC create_expense_in_current_report, ao salvar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const calls = vi.hoisted(() => ({ rpc: vi.fn(), filters: [] as unknown[][], table: '' }));
const result = vi.hoisted(() => ({ data: null as unknown }));

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'not', 'lte', 'gte', 'order', 'limit']) {
    chain[m] = (...args: unknown[]) => {
      calls.filters.push([m, ...args]);
      return chain;
    };
  }
  chain.maybeSingle = () => Promise.resolve({ data: result.data, error: null });
  return {
    supabase: {
      rpc: calls.rpc,
      from: (t: string) => {
        calls.table = t;
        return chain;
      },
    },
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: { id: 'u1', org_id: 'o1' } }),
}));

import { useReportForDate, cycleForDate, DEFAULT_CYCLE_CUTOFF_DAY } from '@/hooks/useCurrentReport';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useReportForDate', () => {
  beforeEach(() => {
    calls.rpc.mockReset();
    calls.filters = [];
    result.data = null;
  });

  it('procura o relatório do ciclo como a RPC (dono + cycle_key), sem criar', async () => {
    result.data = { id: 'r1', title: 'Relatório Out 2026', status: 'draft' };
    const { result: hook } = renderHook(() => useReportForDate('2026-10-10', 24), { wrapper });
    await waitFor(() => expect(hook.current.isSuccess).toBe(true));
    expect(calls.rpc).not.toHaveBeenCalled();
    expect(calls.table).toBe('reports');
    expect(calls.filters).toContainEqual(['eq', 'user_id', 'u1']);
    expect(calls.filters).toContainEqual(['eq', 'cycle_key', '2026-10']);
    expect(hook.current.data).toMatchObject({ id: 'r1' });
  });

  it('o ciclo segue o dia de corte da política', async () => {
    const { result: hook } = renderHook(() => useReportForDate('2026-10-15', 10), { wrapper });
    await waitFor(() => expect(hook.current.isSuccess).toBe(true));
    expect(calls.filters).toContainEqual(['eq', 'cycle_key', '2026-11']);
  });

  it('devolve null quando o relatório do ciclo ainda não existe', async () => {
    const { result: hook } = renderHook(() => useReportForDate('2026-09-01', 24), { wrapper });
    await waitFor(() => expect(hook.current.isSuccess).toBe(true));
    expect(hook.current.data).toBeNull();
    expect(calls.rpc).not.toHaveBeenCalled();
  });
});

describe('cycleForDate (espelha get_or_create_report_for_date)', () => {
  it('dia antes do corte cai no ciclo que começou no mês anterior', () => {
    expect(cycleForDate('2026-10-10', 24)).toEqual({
      start_date: '2026-09-24',
      end_date: '2026-10-23',
      due_date: '2026-10-24',
      cycle_key: '2026-10',
      title: 'Relatório Out 2026',
    });
  });

  it('dia do corte abre o ciclo seguinte', () => {
    expect(cycleForDate('2026-10-24', 24)).toMatchObject({
      start_date: '2026-10-24',
      end_date: '2026-11-23',
      title: 'Relatório Nov 2026',
    });
  });

  it('virada de ano', () => {
    expect(cycleForDate('2026-12-30', 24)).toMatchObject({ cycle_key: '2027-01', title: 'Relatório Jan 2027' });
  });

  it('sem dia de corte na política usa 25, como o banco (COALESCE 25)', () => {
    expect(DEFAULT_CYCLE_CUTOFF_DAY).toBe(25);
    // 24/10 ainda é do ciclo que fecha em 24/10 com corte 25 (com 24 abriria o de Nov).
    expect(cycleForDate('2026-10-24', null)).toMatchObject({
      start_date: '2026-09-25',
      end_date: '2026-10-24',
      cycle_key: '2026-10',
    });
    expect(cycleForDate('2026-10-25')).toMatchObject({ start_date: '2026-10-25', cycle_key: '2026-11' });
  });
});
