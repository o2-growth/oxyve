import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BottomNav } from '@/components/layout/BottomNav';

// Filhos pesados (react-query + AuthContext) — stub pra isolar a navegação.
vi.mock('@/components/expenses/QuickExpenseSheet', () => ({
  QuickExpenseSheet: () => null,
}));
vi.mock('@/components/layout/MoreSheet', () => ({
  MoreSheet: () => null,
}));

beforeEach(() => {
  // Desliga o hint de 1ª vez pra render determinístico (sem timeout pendente).
  localStorage.setItem('oxyve.fab-hint-shown', '1');
});
afterEach(cleanup);

function renderAt(path = '/app/dashboard') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe('BottomNav (mobile)', () => {
  it('renderiza 3 abas de rota (Início / Despesas / Relatórios) + Capturar + Mais', () => {
    renderAt();

    for (const label of ['Início', 'Despesas', 'Relatórios']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    // Captura docada e overflow são botões (não NavLink).
    expect(
      screen.getByRole('button', { name: /capturar despesa por foto/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mais/i })).toBeInTheDocument();

    // Perfil saiu da barra (vive no avatar da TopBar + MoreSheet).
    expect(screen.queryByText('Perfil')).toBeNull();

    // Apenas 3 links de rota — o resto são ações.
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('marca o link ativo conforme a rota atual', () => {
    renderAt('/app/expenses');
    const expensesLink = screen.getByRole('link', { name: /despesas/i });
    expect(expensesLink).toHaveAttribute('aria-current', 'page');
  });

  it('acende o slot "Mais" quando a rota pertence ao overflow (ex.: /app/gestao)', () => {
    renderAt('/app/gestao');
    const maisBtn = screen.getByRole('button', { name: /mais/i });
    expect(maisBtn.className).toMatch(/text-primary/);
  });
});
