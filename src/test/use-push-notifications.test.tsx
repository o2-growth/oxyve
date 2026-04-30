/**
 * Sprint 7 — testes do hook `usePushNotifications`.
 *
 * Mocka window.Notification + navigator.serviceWorker + PushManager (jsdom
 * não tem) e cobre:
 *   - estado inicial quando suportado
 *   - subscribe() pede permissão, persiste no Supabase, atualiza estado
 *   - subscribe() retorna false se permissão negada
 *   - unsubscribe() cancela e deleta do banco
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ---- Mocks --------------------------------------------------------------

const supabaseInsertMock = vi.fn().mockResolvedValue({ error: null });
const supabaseDeleteEqMock = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      upsert: supabaseInsertMock,
      delete: vi.fn(() => ({
        eq: supabaseDeleteEqMock,
      })),
    })),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
  }),
}));

// VAPID public key fake. Precisa ser base64url-decodável pra
// urlBase64ToUint8Array (atob) não explodir. 65 bytes (typical VAPID size)
// representado em base64url.
vi.stubEnv(
  'VITE_VAPID_PUBLIC_KEY',
  'BJ8c4mJxGqvPBg5_pBpL0vPj4aN1S1z3sKfhVnBxNvWmYrU2dHkXxJ7gTfQ4nE9oP_ZcLiMHkVwYp9lA0sBmTfk',
);

// ---- Setup window APIs --------------------------------------------------

interface FakeSubscription {
  endpoint: string;
  unsubscribe: () => Promise<boolean>;
  getKey: (name: string) => ArrayBuffer | null;
  toJSON: () => { keys?: { p256dh: string; auth: string } };
}

let fakeSubscription: FakeSubscription | null;
let requestPermissionMock: ReturnType<typeof vi.fn>;
let subscribeMock: ReturnType<typeof vi.fn>;
let getSubscriptionMock: ReturnType<typeof vi.fn>;

function makeFakeSub(): FakeSubscription {
  return {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    unsubscribe: vi.fn().mockResolvedValue(true),
    getKey: () => new ArrayBuffer(8),
    toJSON: () => ({ keys: { p256dh: 'p256-base64', auth: 'auth-base64' } }),
  };
}

beforeEach(() => {
  fakeSubscription = null;
  supabaseInsertMock.mockClear();
  supabaseDeleteEqMock.mockClear();

  requestPermissionMock = vi.fn().mockResolvedValue('granted');
  subscribeMock = vi.fn().mockImplementation(async () => {
    fakeSubscription = makeFakeSub();
    return fakeSubscription;
  });
  getSubscriptionMock = vi.fn().mockImplementation(async () => fakeSubscription);

  // Notification API.
  // @ts-expect-error — definindo global pra test.
  globalThis.Notification = {
    permission: 'default',
    requestPermission: requestPermissionMock,
  };

  // PushManager flag (apenas pra `'PushManager' in window` passar).
  // @ts-expect-error — global injection.
  globalThis.PushManager = function () {};

  // navigator.serviceWorker
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager: {
          subscribe: subscribeMock,
          getSubscription: getSubscriptionMock,
        },
      }),
    },
  });

  // sessionStorage limpa.
  try {
    window.sessionStorage.clear();
  } catch {
    /* noop */
  }
});

afterEach(() => {
  vi.clearAllMocks();
});

// Import depois de mocks.
import { usePushNotifications } from '@/hooks/usePushNotifications';

describe('usePushNotifications', () => {
  it('expõe supported=true e permission inicial quando APIs estão presentes', async () => {
    const { result } = renderHook(() => usePushNotifications());

    expect(result.current.supported).toBe(true);
    expect(result.current.permission).toBe('default');
    expect(result.current.hasVapidKey).toBe(true);
    // Sync inicial: sem subscription ativa.
    await waitFor(() => expect(result.current.subscribed).toBe(false));
  });

  it('subscribe() pede permissão, assina e persiste no Supabase', async () => {
    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      const ok = await result.current.subscribe();
      expect(ok).toBe(true);
    });

    expect(requestPermissionMock).toHaveBeenCalledTimes(1);
    expect(subscribeMock).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(supabaseInsertMock).toHaveBeenCalledTimes(1);
    expect(supabaseInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      }),
      expect.objectContaining({ onConflict: 'endpoint' }),
    );
    expect(result.current.subscribed).toBe(true);
  });

  it('subscribe() retorna false e não persiste se permissão for negada', async () => {
    requestPermissionMock.mockResolvedValueOnce('denied');

    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      const ok = await result.current.subscribe();
      expect(ok).toBe(false);
    });

    expect(supabaseInsertMock).not.toHaveBeenCalled();
    expect(result.current.subscribed).toBe(false);
    await waitFor(() => expect(result.current.permission).toBe('denied'));
  });

  it('unsubscribe() cancela subscription e deleta do banco', async () => {
    // Pre-existing subscription antes de inicializar.
    fakeSubscription = makeFakeSub();

    const { result } = renderHook(() => usePushNotifications());

    // Espera o sync inicial detectar subscription existente.
    await waitFor(() => expect(result.current.subscribed).toBe(true));

    await act(async () => {
      const ok = await result.current.unsubscribe();
      expect(ok).toBe(true);
    });

    expect(supabaseDeleteEqMock).toHaveBeenCalledTimes(1);
    expect(result.current.subscribed).toBe(false);
  });
});
