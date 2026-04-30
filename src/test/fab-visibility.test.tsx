/**
 * Sprint 6 — visibilidade do QuickExpenseFab por rota.
 * Aparece em /app/dashboard, /app/expenses, /app/reports;
 * some em /app/settings/* e fora do app.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
    profile: { id: 'u1', org_id: 'o1' },
  }),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => true,
}));

import { QuickExpenseFab } from '@/components/expenses/QuickExpenseFab';

function renderAt(path: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <QuickExpenseFab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('QuickExpenseFab — visibility', () => {
  afterEach(() => {
    cleanup();
    try {
      window.localStorage.removeItem('oxyve.fab-hint-shown');
    } catch {
      // noop
    }
  });

  it('aparece em /app/dashboard', () => {
    renderAt('/app/dashboard');
    expect(screen.getByLabelText(/nova despesa por foto/i)).toBeInTheDocument();
  });

  it('aparece em /app/expenses', () => {
    renderAt('/app/expenses');
    expect(screen.getByLabelText(/nova despesa por foto/i)).toBeInTheDocument();
  });

  it('aparece em /app/reports', () => {
    renderAt('/app/reports');
    expect(screen.getByLabelText(/nova despesa por foto/i)).toBeInTheDocument();
  });

  it('some em /app/settings/profile', () => {
    renderAt('/app/settings/profile');
    expect(screen.queryByLabelText(/nova despesa por foto/i)).toBeNull();
  });

  it('some em /app/settings/team', () => {
    renderAt('/app/settings/team');
    expect(screen.queryByLabelText(/nova despesa por foto/i)).toBeNull();
  });

  it('some em rotas fora de /app/dashboard|expenses|reports', () => {
    renderAt('/login');
    expect(screen.queryByLabelText(/nova despesa por foto/i)).toBeNull();
  });
});
