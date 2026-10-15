/**
 * useValidateReceipt — resposta atrasada de uma leitura antiga não pode sobrescrever a
 * mais recente (o form revalida quando data/valor mudam, e a IA responde fora de ordem).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));

import { useValidateReceipt } from '@/hooks/useValidateReceipt';

class FileReaderStub {
  result: string | null = null;
  onload: (() => void) | null = null;
  onloadend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL() {
    setTimeout(() => {
      this.result = 'data:image/jpeg;base64,YWJj';
      this.onload?.();
      this.onloadend?.();
    }, 0);
  }
}
vi.stubGlobal('FileReader', FileReaderStub);

const file = new File(['abc'], 'nota.jpg', { type: 'image/jpeg' });
const read = { extracted_date: '2026-10-10', extracted_amount_cents: 5000, confidence: 'high' };

describe('useValidateReceipt', () => {
  beforeEach(() => invoke.mockReset());

  it('ignora a resposta de uma leitura anterior que chega depois da nova', async () => {
    let resolveOld: (v: unknown) => void = () => {};
    invoke
      .mockImplementationOnce(() => new Promise((r) => (resolveOld = r)))
      .mockResolvedValueOnce({ data: read, error: null });

    const { result } = renderHook(() => useValidateReceipt());

    // 1ª leitura com valor errado (fica pendurada), 2ª com o valor certo.
    act(() => void result.current.validate(file, '2026-10-10', 100));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    await act(() => result.current.validate(file, '2026-10-10', 5000));
    expect(result.current.status).toBe('success');

    await act(async () => resolveOld({ data: read, error: null }));
    expect(result.current.status).toBe('success');
    expect(result.current.divergences).toEqual([]);
  });

  it('reset no meio da leitura não é desfeito pela resposta', async () => {
    let resolveOld: (v: unknown) => void = () => {};
    invoke.mockImplementationOnce(() => new Promise((r) => (resolveOld = r)));
    const { result } = renderHook(() => useValidateReceipt());

    act(() => void result.current.validate(file, '2026-10-10', 5000));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    act(() => result.current.reset());
    await act(async () => resolveOld({ data: read, error: null }));
    expect(result.current.status).toBe('idle');
  });
});
