/**
 * Recusa do admin_decide_report (decisão 2: revisão item a item completa) chega
 * ao gestor com a mensagem pt-BR do banco, sem prefixo técnico.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const rpc = vi.fn();
const toastError = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) } }));

import { decisionErrorMessage, useApproveReportRpc, useMarkReportPaidRpc } from '@/hooks/useReportActions';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('decisionErrorMessage', () => {
  it('regra de negócio (P0001) vai sem prefixo', () => {
    expect(
      decisionErrorMessage({ code: 'P0001', message: 'Revise todos os itens antes de aprovar (2 de 5 revisados).' }, 'Erro: '),
    ).toBe('Revise todos os itens antes de aprovar (2 de 5 revisados).');
  });
  it('erro técnico ganha prefixo', () => {
    expect(decisionErrorMessage(new TypeError('Failed to fetch'), 'Erro ao aprovar: ')).toBe(
      'Erro ao aprovar: Failed to fetch',
    );
  });
});

describe('useApproveReportRpc / useMarkReportPaidRpc', () => {
  beforeEach(() => {
    rpc.mockReset();
    toastError.mockReset();
  });

  it('mostra a recusa do banco ao aprovar com item sem revisão', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'Revise todos os itens antes de aprovar (1 de 3 revisados).' },
    });
    const { result } = renderHook(() => useApproveReportRpc(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ reportId: 'r1', decision: 'approved' }).catch(() => {});
    });
    expect(toastError).toHaveBeenCalledWith('Revise todos os itens antes de aprovar (1 de 3 revisados).');
  });

  it('gestor tentando pagar vê a mensagem de só admin', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'Acesso restrito a administradores: só admin marca reembolso como pago.' },
    });
    const { result } = renderHook(() => useMarkReportPaidRpc(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('r1').catch(() => {});
    });
    expect(toastError).toHaveBeenCalledWith('Acesso restrito a administradores: só admin marca reembolso como pago.');
  });
});
