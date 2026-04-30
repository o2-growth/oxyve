import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from '@/pages/Login';

// Mock supabase client (dependência transitiva via AuthContext + bootstrap).
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
    from: vi.fn().mockReturnThis(),
    rpc: vi.fn(),
  },
}));

// Mock useAuth para isolar de provider real.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    signIn: vi.fn(),
    signUp: vi.fn(),
    requestPasswordReset: vi.fn(),
  }),
}));

function renderLoginAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Login />
    </MemoryRouter>,
  );
}

describe('Login — invite-gated signup tab', () => {
  beforeEach(() => {
    cleanup();
  });

  it('não exibe a tab "Cadastrar" sem ?invite= na URL', () => {
    renderLoginAt('/login');
    // Tab "Cadastrar" não deve estar presente.
    expect(screen.queryByTestId('signup-tab')).toBeNull();
    // Aviso para usuário sem invite deve aparecer.
    expect(
      screen.getByText(/Você precisa de um convite/i),
    ).toBeInTheDocument();
    // Mas o form de "Entrar" ainda existe.
    expect(screen.getByRole('button', { name: /^Entrar$/i })).toBeInTheDocument();
  });

  it('exibe a tab "Cadastrar" quando ?invite=token está presente', () => {
    renderLoginAt('/login?invite=abc123');
    expect(screen.getByTestId('signup-tab')).toBeInTheDocument();
  });
});
