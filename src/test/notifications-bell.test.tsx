/**
 * Sino: notificação de relatório enviado (category 'reports', gravada pelo banco)
 * tem aba própria; antes só aparecia em "Todas".
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const rows = [
  { id: 'n1', title: 'Relatório enviado por Bia', body: null, category: 'reports', link: '/app/reports/r1', read_at: null, created_at: '2026-10-15T10:00:00Z' },
  { id: 'n2', title: 'Despesa aprovada', body: null, category: 'my_expenses', link: null, read_at: null, created_at: '2026-10-15T09:00:00Z' },
];

vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({ data: rows, isLoading: false }),
  useUnreadNotificationsCount: () => 2,
  useMarkNotificationRead: () => ({ mutateAsync: vi.fn() }),
  useMarkAllNotificationsRead: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { NotificationsBell } from '@/components/notifications/NotificationsBell';

describe('NotificationsBell', () => {
  afterEach(() => cleanup());

  it('aba Relatórios mostra só as de relatório', async () => {
    render(
      <MemoryRouter>
        <NotificationsBell />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Notificações' }));
    const tab = await screen.findByRole('tab', { name: 'Relatórios' });
    // Radix Tabs troca no mouseDown.
    fireEvent.mouseDown(tab);
    expect(await screen.findByText('Relatório enviado por Bia')).toBeInTheDocument();
    expect(screen.queryByText('Despesa aprovada')).toBeNull();
  });
});
