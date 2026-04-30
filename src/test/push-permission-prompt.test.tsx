/**
 * Sprint 7 — testes do PushPermissionPrompt.
 *
 * Cobre:
 *   - não renderiza se não há suporte / sem VAPID
 *   - não renderiza se permission != 'default'
 *   - aparece após o delay e some ao clicar "Ativar"
 *   - botão "Mais tarde" persiste dismiss e esconde card
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const subscribeMock = vi.fn().mockResolvedValue(true);

vi.mock('@/hooks/usePushNotifications', () => ({
  usePushNotifications: vi.fn(() => ({
    supported: true,
    permission: 'default',
    subscribed: false,
    loading: false,
    hasVapidKey: true,
    subscribe: subscribeMock,
    unsubscribe: vi.fn(),
  })),
}));

import { usePushNotifications } from '@/hooks/usePushNotifications';
import { PushPermissionPrompt } from '@/components/notifications/PushPermissionPrompt';

const usePushNotificationsMock = vi.mocked(usePushNotifications);

const SHOWN_KEY = 'oxyve.pushPromptShownAt';
const DISMISS_KEY = 'oxyve.pushPromptDismissedAt';

/**
 * Pré-seta o timestamp de "primeira visualização" pra 60s atrás. O efeito
 * calcula `remaining = max(0, 30_000 - elapsed)` → setTimeout dispara
 * imediatamente. Evita ter que fakear timers globais (quebra waitFor).
 */
function fastForwardDelay() {
  try {
    window.localStorage.setItem(SHOWN_KEY, String(Date.now() - 60_000));
  } catch {
    /* noop */
  }
}

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* noop */
  }
  subscribeMock.mockClear();
  usePushNotificationsMock.mockReturnValue({
    supported: true,
    permission: 'default',
    subscribed: false,
    loading: false,
    hasVapidKey: true,
    subscribe: subscribeMock,
    unsubscribe: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
});

describe('PushPermissionPrompt', () => {
  it('não renderiza se browser não suporta push', async () => {
    usePushNotificationsMock.mockReturnValue({
      supported: false,
      permission: 'unsupported',
      subscribed: false,
      loading: false,
      hasVapidKey: false,
      subscribe: subscribeMock,
      unsubscribe: vi.fn(),
    });

    fastForwardDelay();
    render(<PushPermissionPrompt />);
    // Aguarda janela razoável pra effect tentar mostrar — não deve.
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId('push-permission-prompt')).toBeNull();
  });

  it('não renderiza se permission já é granted', async () => {
    usePushNotificationsMock.mockReturnValue({
      supported: true,
      permission: 'granted',
      subscribed: true,
      loading: false,
      hasVapidKey: true,
      subscribe: subscribeMock,
      unsubscribe: vi.fn(),
    });

    fastForwardDelay();
    render(<PushPermissionPrompt />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId('push-permission-prompt')).toBeNull();
  });

  it('aparece após o delay e some ao clicar Ativar', async () => {
    fastForwardDelay();
    render(<PushPermissionPrompt />);

    // Com SHOWN_KEY pré-datado, setTimeout(remaining=0) dispara no próximo tick.
    await waitFor(() => {
      expect(screen.getByTestId('push-permission-prompt')).toBeInTheDocument();
    });
    expect(screen.getByTestId('push-enable-btn')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('push-enable-btn'));

    await waitFor(() => {
      expect(subscribeMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('push-permission-prompt')).toBeNull();
    });
  });

  it('botão "Mais tarde" persiste dismiss e esconde card', async () => {
    fastForwardDelay();
    render(<PushPermissionPrompt />);

    await waitFor(() => {
      expect(screen.getByTestId('push-permission-prompt')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('push-dismiss-btn'));

    expect(screen.queryByTestId('push-permission-prompt')).toBeNull();
    expect(localStorage.getItem(DISMISS_KEY)).toBeTruthy();
  });
});
