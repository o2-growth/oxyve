/**
 * C5 — switch de notificações push em Configurações > Perfil.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const subscribeMock = vi.fn();
const unsubscribeMock = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('sonner', () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}));

type HookState = {
  supported: boolean;
  permission: 'default' | 'granted' | 'denied' | 'unsupported';
  subscribed: boolean;
  loading: boolean;
  hasVapidKey: boolean;
};
let state: HookState;

vi.mock('@/hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({ ...state, subscribe: subscribeMock, unsubscribe: unsubscribeMock }),
}));

import { PushSettingsCard } from '@/components/notifications/PushSettingsCard';

beforeEach(() => {
  vi.clearAllMocks();
  state = { supported: true, permission: 'default', subscribed: false, loading: false, hasVapidKey: true };
});

describe('PushSettingsCard', () => {
  it('ativa o push pelo switch', async () => {
    subscribeMock.mockResolvedValueOnce(true);
    render(<PushSettingsCard />);

    const sw = screen.getByRole('switch', { name: /notificações no celular/i });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);

    await waitFor(() => expect(subscribeMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });

  it('desativa o push quando já está inscrito', async () => {
    state.subscribed = true;
    state.permission = 'granted';
    unsubscribeMock.mockResolvedValueOnce(true);
    render(<PushSettingsCard />);

    const sw = screen.getByRole('switch', { name: /notificações no celular/i });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(sw);

    await waitFor(() => expect(unsubscribeMock).toHaveBeenCalledTimes(1));
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it('avisa quando não consegue ativar', async () => {
    subscribeMock.mockResolvedValueOnce(false);
    render(<PushSettingsCard />);
    fireEvent.click(screen.getByRole('switch', { name: /notificações no celular/i }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
  });

  it('orienta a liberar no navegador quando a permissão foi bloqueada', () => {
    state.permission = 'denied';
    render(<PushSettingsCard />);
    expect(screen.getByRole('switch', { name: /notificações no celular/i })).toBeDisabled();
    expect(screen.getByText(/bloqueou as notificações/i)).toBeInTheDocument();
  });

  it('desabilita sem suporte no navegador', () => {
    state.supported = false;
    state.permission = 'unsupported';
    render(<PushSettingsCard />);
    expect(screen.getByRole('switch', { name: /notificações no celular/i })).toBeDisabled();
    expect(screen.getByText(/não suporta/i)).toBeInTheDocument();
  });
});
