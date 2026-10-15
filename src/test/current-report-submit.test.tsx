/**
 * uso-real-4: "Enviar Relatório" no Início pede confirmação com quantidade,
 * valor e período, e avisa quando o ciclo ainda não terminou.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mutate = vi.fn();

vi.mock('@/hooks/useCurrentReport', () => ({
  useDashboardContext: () => ({
    isLoading: false,
    data: {
      current_report: {
        id: 'r1',
        title: 'Relatório Out 2026',
        start_date: '2026-10-01',
        end_date: '2026-10-31',
        due_date: '2026-11-05',
        cycle_key: '2026-10',
        status: 'draft',
        created_at: '2026-10-01',
      },
      pending_due_report: null,
      days_until_due: 21,
      today: '2026-10-15',
    },
  }),
  useSubmitReportRpc: () => ({ mutate, isPending: false }),
}));

import { CurrentReportCard } from '@/components/dashboard/CurrentReportCard';

describe('CurrentReportCard — enviar', () => {
  afterEach(() => cleanup());

  it('não envia direto: confirma com resumo e aviso de ciclo aberto', async () => {
    render(
      <MemoryRouter>
        <CurrentReportCard onAddExpense={vi.fn()} reportExpenses={{ total_cents: 4550, count: 2 }} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Enviar Relatório/ }));
    expect(mutate).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('alertdialog');
    const text = dialog.textContent ?? '';
    expect(text).toContain('2 despesas');
    expect(text).toMatch(/R\$\s?45,50 a reembolsar/);
    expect(text).toContain('01/10/2026 a 31/10/2026');
    expect(text).toMatch(/faltam 16 dias/);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Enviar' }));
    expect(mutate).toHaveBeenCalledWith('r1', expect.anything());
  });
});
