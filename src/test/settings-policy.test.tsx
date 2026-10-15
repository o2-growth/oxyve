/**
 * E3 / dinheiro-datas-4 / D3 — tela de política de despesas.
 *   - dois campos alterados em sequência rápida vão os dois para o banco
 *   - o switch muda na hora (não "volta" esperando a rede)
 *   - sair da página com alteração pendente salva em vez de descartar
 *   - teto de alimentação vazio/0 não é salvo (viraria "sem limite")
 *   - dia de corte padrão na tela = 25
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const mutateMock = vi.fn();
const toastError = vi.fn();

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) },
}));

vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/settings/SettingsLayout', () => ({
  SettingsLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/settings/CostCentersList', () => ({ CostCentersList: () => null }));
vi.mock('@/components/settings/ProjectsList', () => ({ ProjectsList: () => null }));
vi.mock('@/components/settings/DepartmentsList', () => ({ DepartmentsList: () => null }));
vi.mock('@/components/settings/ExpenseTypesList', () => ({ ExpenseTypesList: () => null }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true }),
}));

const basePolicy = {
  id: 'pol-1',
  org_id: 'org-1',
  default_currency: 'BRL',
  require_cost_center: false,
  require_project: false,
  require_receipt: false,
  cycle_cutoff_day: 25,
  timezone: 'America/Sao_Paulo',
  enforce_limits_mode: 'warn',
  food_daily_limit_cents: 3000,
  transport_daily_limit_cents: null,
  km_rate_cents: 0,
  updated_at: '2026-10-01T12:00:00Z',
};
let policyData: typeof basePolicy | undefined;

vi.mock('@/hooks/usePolicy', () => ({
  useExpensePolicy: () => ({ data: policyData, isLoading: false, dataUpdatedAt: 0 }),
  useUpdateExpensePolicy: () => ({
    mutate: mutateMock,
    isPending: false,
    isSuccess: false,
  }),
}));

import SettingsPolicy from '@/pages/app/SettingsPolicy';

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPolicy />
    </MemoryRouter>,
  );
}

function switchFor(label: RegExp) {
  return screen.getByRole('switch', { name: label });
}

function sentPatches() {
  return mutateMock.mock.calls.map((c) => c[0]);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  policyData = { ...basePolicy };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SettingsPolicy', () => {
  it('salva os dois switches quando mudam em sequência rápida', () => {
    renderPage();
    fireEvent.click(switchFor(/centro de custo obrigatório/i));
    fireEvent.click(switchFor(/projeto obrigatório/i));

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    const patches = sentPatches();
    expect(patches).toContainEqual({ id: 'pol-1', require_cost_center: true });
    expect(patches).toContainEqual({ id: 'pol-1', require_project: true });
  });

  it('o switch muda na hora, antes da resposta do servidor', () => {
    renderPage();
    const sw = switchFor(/comprovante obrigatório/i);
    fireEvent.click(sw);
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  it('cliques repetidos no mesmo switch viram um só save com o valor final', () => {
    renderPage();
    const sw = switchFor(/comprovante obrigatório/i);
    fireEvent.click(sw);
    fireEvent.click(sw);
    fireEvent.click(sw);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    const doCampo = sentPatches().filter((p) => 'require_receipt' in p);
    expect(doCampo).toEqual([{ id: 'pol-1', require_receipt: true }]);
  });

  it('sair da página com alteração pendente salva em vez de descartar', () => {
    const { unmount } = renderPage();
    fireEvent.click(switchFor(/projeto obrigatório/i));
    expect(mutateMock).not.toHaveBeenCalled();
    unmount();
    expect(sentPatches()).toContainEqual({ id: 'pol-1', require_project: true });
  });

  it('salva o teto de alimentação em centavos', () => {
    renderPage();
    const input = screen.getByLabelText(/teto de alimentação/i);
    fireEvent.change(input, { target: { value: '45.50' } });
    fireEvent.blur(input);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(sentPatches()).toContainEqual({ id: 'pol-1', food_daily_limit_cents: 4550 });
  });

  it.each([[''], ['0'], ['0.00'], ['-5']])('não salva teto "%s" e avisa', (valor) => {
    renderPage();
    const input = screen.getByLabelText(/teto de alimentação/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: valor } });
    fireEvent.blur(input);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(sentPatches().filter((p) => 'food_daily_limit_cents' in p)).toEqual([]);
    expect(toastError).toHaveBeenCalled();
    // Volta a mostrar o teto vigente.
    expect(input.value).toBe('30.00');
  });

  it('sem política carregada, o dia de corte padrão mostrado é 25', () => {
    policyData = undefined;
    renderPage();
    expect(screen.getByRole('combobox', { name: /dia de corte/i })).toHaveTextContent('Dia 25');
  });
});
