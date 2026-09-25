import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from '@/pages/Login';

const signInWithGoogle = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ signInWithGoogle }),
}));

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Login />
    </MemoryRouter>,
  );
}

describe('Login — só Google da O2 Inc.', () => {
  beforeEach(() => {
    cleanup();
    signInWithGoogle.mockClear();
    window.history.replaceState(null, '', '/login');
  });

  it('não oferece e-mail/senha nem cadastro', () => {
    renderLogin();
    expect(screen.queryByLabelText(/senha/i)).toBeNull();
    expect(screen.queryByLabelText(/email/i)).toBeNull();
    expect(screen.queryByText(/cadastrar/i)).toBeNull();
  });

  it('o botão dispara o OAuth do Google', () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: /entrar com google/i }));
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('mostra o motivo quando o Auth recusa o e-mail', () => {
    window.history.replaceState(
      null,
      '',
      '/login?error=access_denied&error_description=Acesso+restrito+a+contas+Google+da+O2+Inc.',
    );
    renderLogin();
    expect(screen.getByRole('alert')).toHaveTextContent('Acesso restrito a contas Google da O2 Inc.');
    expect(window.location.search).toBe('');
  });
});
