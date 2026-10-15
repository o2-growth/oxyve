/**
 * Logout: tira o push do aparelho (antes do signOut, com sessão), limpa o
 * Cache Storage de runtime e o cache do React Query. Falha na limpeza não
 * pode impedir o logout.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const ordem: string[] = [];

const signOutMock = vi.fn(async () => {
  ordem.push('signOut');
  return { error: null };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signOut: () => signOutMock(),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}));

vi.mock('@/hooks/useBootstrap', () => ({ bootstrapUser: vi.fn() }));

const removePushMock = vi.fn(async () => {
  ordem.push('push');
});
vi.mock('@/hooks/usePushNotifications', () => ({
  removeDevicePushSubscription: () => removePushMock(),
}));

const clearCachesMock = vi.fn(async () => {
  ordem.push('caches');
});
vi.mock('@/lib/pwaCache', () => ({
  clearRuntimeCaches: () => clearCachesMock(),
}));

import { AuthProvider, useAuth } from '@/contexts/AuthContext';

let ctx: ReturnType<typeof useAuth> | null = null;
function Capture() {
  ctx = useAuth();
  return null;
}

function setup() {
  const qc = new QueryClient();
  qc.setQueryData(['expenses'], [{ id: 'despesa-do-usuario-anterior' }]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
  render(<Capture />, { wrapper });
  return qc;
}

beforeEach(() => {
  ordem.length = 0;
  ctx = null;
  vi.clearAllMocks();
});

describe('AuthContext.signOut', () => {
  it('remove o push antes do signOut e limpa caches', async () => {
    const qc = setup();

    await act(async () => {
      await ctx!.signOut();
    });

    expect(ordem.indexOf('push')).toBeGreaterThanOrEqual(0);
    expect(ordem.indexOf('push')).toBeLessThan(ordem.indexOf('signOut'));
    expect(clearCachesMock).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData(['expenses'])).toBeUndefined();
  });

  it('desloga mesmo se a limpeza do push e do cache falhar', async () => {
    removePushMock.mockRejectedValueOnce(new Error('falhou'));
    clearCachesMock.mockRejectedValueOnce(new Error('falhou'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setup();

    await act(async () => {
      await ctx!.signOut();
    });

    expect(signOutMock).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
