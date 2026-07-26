import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// isAdmin controla só o grupo "Administração" dentro do MoreSheet (mockado aqui).
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: false }),
}));

// Sheets são portais Radix (fechados por padrão não montam conteúdo); mockamos
// pra isolar a BottomNav de dependências pesadas (supabase/query/theme).
vi.mock('@/components/expenses/QuickExpenseSheet', () => ({
  QuickExpenseSheet: () => null,
}));
vi.mock('@/components/layout/MoreSheet', () => ({
  MoreSheet: () => null,
}));

import { BottomNav } from '@/components/layout/BottomNav';

afterEach(cleanup);

function renderAt(path = '/app/dashboard') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe('BottomNav (mobile)', () => {
  it('renderiza as 4 abas (Início / Despesas / Relatórios / Mais) + FAB de captura', () => {
    renderAt();

    for (const label of ['Início', 'Despesas', 'Relatórios', 'Mais']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    // FAB central de nova despesa (botão, não rota).
    expect(screen.getByLabelText(/nova despesa/i)).toBeInTheDocument();

    // Só Início/Despesas/Relatórios são links; FAB e "Mais" são botões.
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('marca o link ativo conforme a rota atual', () => {
    renderAt('/app/expenses');
    const expensesLink = screen.getByRole('link', { name: /despesas/i });
    // NavLink adiciona aria-current="page" na rota ativa por padrão.
    expect(expensesLink).toHaveAttribute('aria-current', 'page');
  });

  it('a aba Mais acende em rotas do overflow (ex.: /app/advances)', () => {
    renderAt('/app/advances');
    const mais = screen.getByRole('button', { name: /mais/i });
    // text-primary é o marcador visual do estado ativo.
    expect(mais.className).toContain('text-primary');
  });
});
