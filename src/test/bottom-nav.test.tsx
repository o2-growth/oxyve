import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
  it('renderiza os 4 itens principais (Dashboard / Despesas / Relatórios / Perfil)', () => {
    renderAt();

    const labels = ['Dashboard', 'Despesas', 'Relatórios', 'Perfil'];
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(4);
  });

  it('marca o link ativo conforme a rota atual', () => {
    renderAt('/app/expenses');
    const expensesLink = screen.getByRole('link', { name: /despesas/i });
    // NavLink active class default `active`, mas testamos o atributo data
    // estável pelo `aria-current`.
    expect(expensesLink).toHaveAttribute('aria-current', 'page');
  });
});
