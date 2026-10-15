/**
 * E3 — SettingsPolicy com o hook real (React Query de verdade).
 *
 * O useMutation do TanStack v5 só chama os callbacks passados ao `mutate()` da
 * ÚLTIMA chamada. Se dois campos estão em voo e o primeiro falha, a tela não
 * pode continuar mostrando o valor que não foi salvo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

type Deferred = {
  updates: Record<string, unknown>;
  resolve: (v: { data: unknown; error: unknown }) => void;
};

const serverPolicy: Record<string, unknown> = {};
let inFlight: Deferred[] = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        single: async () => ({ data: { ...serverPolicy }, error: null }),
      }),
      update: (updates: Record<string, unknown>) => ({
        eq: () => ({
          select: () => ({
            single: () =>
              new Promise((resolve) => {
                inFlight.push({ updates, resolve });
              }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true, profile: { org_id: 'org-1' } }),
}));
vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/settings/SettingsLayout', () => ({
  SettingsLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/settings/CostCentersList', () => ({ CostCentersList: () => null }));
vi.mock('@/components/settings/ProjectsList', () => ({ ProjectsList: () => null }));
vi.mock('@/components/settings/DepartmentsList', () => ({ DepartmentsList: () => null }));
vi.mock('@/components/settings/ExpenseTypesList', () => ({ ExpenseTypesList: () => null }));

import SettingsPolicy from '@/pages/app/SettingsPolicy';

beforeEach(() => {
  inFlight = [];
  Object.assign(serverPolicy, {
    id: 'pol-1',
    org_id: 'org-1',
    default_currency: 'BRL',
    require_cost_center: false,
    require_project: false,
    require_receipt: false,
    cycle_cutoff_day: 25,
    timezone: 'America/Sao_Paulo',
    enforce_limits_mode: 'warn',
    food_daily_limit_cents: 3000,
    transport_daily_limit_cents: null,
    km_rate_cents: 0,
    updated_at: '2026-10-01T12:00:00Z',
  });
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SettingsPolicy />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SettingsPolicy + useUpdateExpensePolicy', () => {
  it('campo que falhou volta ao valor salvo mesmo com outro save em voo', async () => {
    renderPage();
    const costCenter = await screen.findByRole('switch', { name: /centro de custo obrigatório/i });
    const project = screen.getByRole('switch', { name: /projeto obrigatório/i });

    fireEvent.click(costCenter);
    await waitFor(() => expect(inFlight).toHaveLength(1));
    fireEvent.click(project);
    await waitFor(() => expect(inFlight).toHaveLength(2));

    // 1º (centro de custo) falha; 2º (projeto) salva.
    await act(async () => {
      inFlight[0].resolve({ data: null, error: { message: 'falhou' } });
    });
    await act(async () => {
      serverPolicy.require_project = true;
      inFlight[1].resolve({ data: { ...serverPolicy }, error: null });
    });

    await waitFor(() => expect(costCenter).toHaveAttribute('aria-checked', 'false'));
    await waitFor(() => expect(project).toHaveAttribute('aria-checked', 'true'));
  });
});
