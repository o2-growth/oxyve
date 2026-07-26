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
      signInWithOAuth: vi.fn(),
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
    signInWithGoogle: vi.fn(),
    requestPasswordReset: vi.fn(),
    updatePassword: vi.fn(),
    isRecoveryMode: false,
  }),
}));

function renderLoginAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Login />
    </MemoryRouter>,
  );
}

describe('Login — abas Entrar/Cadastrar (auto-join por domínio)', () => {
  beforeEach(() => {
    cleanup();
  });

  it('exibe a tab "Cadastrar" mesmo sem ?invite= (auto-join por domínio)', () => {
    renderLoginAt('/login');
    // Convite deixou de ser obrigatório — a aba de cadastro sempre aparece.
    expect(screen.getByTestId('signup-tab')).toBeInTheDocument();
    // O aviso de convite não deve mais existir.
    expect(screen.queryByText(/Você precisa de um convite/i)).toBeNull();
    // O botão de entrar continua presente.
    expect(screen.getByRole('button', { name: /^Entrar$/i })).toBeInTheDocument();
  });

  it('exibe a tab "Cadastrar" quando ?invite=token está presente', () => {
    renderLoginAt('/login?invite=abc123');
    expect(screen.getByTestId('signup-tab')).toBeInTheDocument();
  });
});
