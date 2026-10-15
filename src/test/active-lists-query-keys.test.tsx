/**
 * E1 — listas "só ativos" (filtro de Despesas) e "todas" (Configurações) não podem
 * dividir o cache: com a mesma chave, os projetos inativos sumiam de Configurações.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const rows = [
  { id: 'p1', name: 'Ativo', is_active: true },
  { id: 'p2', name: 'Inativo', is_active: false },
];

vi.mock('@/integrations/supabase/client', () => {
  const make = () => {
    let onlyActive = false;
    const chain = {
      select: () => chain,
      eq: (col: string, v: unknown) => {
        if (col === 'is_active' && v === true) onlyActive = true;
        return chain;
      },
      order: () => Promise.resolve({ data: onlyActive ? rows.filter((r) => r.is_active) : rows, error: null }),
    };
    return chain;
  };
  return { supabase: { from: () => make() } };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: { id: 'u1', org_id: 'o1' } }),
}));

import { useProjects as useActiveProjectsFromExpenses, useCostCenters as useActiveCostCentersFromExpenses } from '@/hooks/useExpenses';
import { useProjects, useCostCenters } from '@/hooks/usePolicy';

describe('query keys de projetos e centros de custo', () => {
  it.each([
    ['projetos', useActiveProjectsFromExpenses, useProjects],
    ['centros de custo', useActiveCostCentersFromExpenses, useCostCenters],
  ])('lista só de ativos não contamina a lista completa (%s)', async (_n, useActive, useAll) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const active = renderHook(() => useActive(), { wrapper });
    await waitFor(() => expect(active.result.current.isSuccess).toBe(true));
    const all = renderHook(() => useAll(), { wrapper });
    await waitFor(() => expect(all.result.current.isSuccess).toBe(true));
    expect(all.result.current.data).toHaveLength(2);
    expect(active.result.current.data).toHaveLength(1);
  });
});
