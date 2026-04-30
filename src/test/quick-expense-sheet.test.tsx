/**
 * Sprint 6 — testes do QuickExpenseSheet.
 * Cobre render dos 3 steps (capture / review / edit) e a transição
 * via botão "Editar detalhes".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Mock supabase (transitivo via useCreateExpense + useValidateReceipt).
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'e1' }, error: null }),
        })),
      })),
    })),
    functions: {
      invoke: vi.fn().mockResolvedValue({
        data: {
          extracted_date: '2026-04-29',
          extracted_amount_cents: 4250,
          confidence: 'high',
        },
        error: null,
      }),
    },
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
    profile: { id: 'u1', org_id: 'o1' },
  }),
}));

// useIsMobile fixo em false (desktop) — file picker em vez de auto-camera.
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

import { QuickExpenseSheet } from '@/components/expenses/QuickExpenseSheet';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('QuickExpenseSheet — state machine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('inicia em step "capture" mostrando botão pra abrir câmera/picker', () => {
    render(
      <QuickExpenseSheet open={true} onOpenChange={() => {}} />,
      { wrapper },
    );

    expect(screen.getByTestId('step-capture')).toBeInTheDocument();
    expect(screen.getByTestId('open-camera-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('step-review')).toBeNull();
    expect(screen.queryByTestId('step-edit')).toBeNull();
  });

  it('renderiza step "review" quando initialStep=review', () => {
    render(
      <QuickExpenseSheet
        open={true}
        onOpenChange={() => {}}
        initialStep="review"
      />,
      { wrapper },
    );

    expect(screen.getByTestId('step-review')).toBeInTheDocument();
    expect(screen.getByTestId('quick-save-btn')).toBeInTheDocument();
    expect(screen.getByTestId('edit-details-btn')).toBeInTheDocument();
  });

  it('transiciona review → edit ao clicar "Editar detalhes"', () => {
    render(
      <QuickExpenseSheet
        open={true}
        onOpenChange={() => {}}
        initialStep="review"
      />,
      { wrapper },
    );

    expect(screen.getByTestId('step-review')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('edit-details-btn'));

    expect(screen.getByTestId('step-edit')).toBeInTheDocument();
    expect(screen.queryByTestId('step-review')).toBeNull();
  });

  it('renderiza form em step "edit" com campos descrição/valor/data', () => {
    render(
      <QuickExpenseSheet
        open={true}
        onOpenChange={() => {}}
        initialStep="edit"
      />,
      { wrapper },
    );

    expect(screen.getByTestId('step-edit')).toBeInTheDocument();
    expect(screen.getByLabelText(/Descrição/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Valor/i)).toBeInTheDocument();
    expect(screen.getByText(/Salvar/i)).toBeInTheDocument();
  });

  it('não renderiza nada quando open=false', () => {
    render(
      <QuickExpenseSheet open={false} onOpenChange={() => {}} />,
      { wrapper },
    );

    expect(screen.queryByTestId('step-capture')).toBeNull();
    expect(screen.queryByTestId('step-review')).toBeNull();
    expect(screen.queryByTestId('step-edit')).toBeNull();
  });
});
