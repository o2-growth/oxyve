/**
 * useValidateReceipt — resposta atrasada de uma leitura antiga não pode sobrescrever a
 * mais recente (o form revalida quando data/valor mudam, e a IA responde fora de ordem).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));

import { useValidateReceipt, readingReview, toValidationResult } from '@/hooks/useValidateReceipt';

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

  it.each([
    [429, 'Limite de leituras automáticas atingido. Preencha data e valor à mão — a despesa pode ser salva normalmente.'],
    [413, 'Imagem muito grande para leitura automática. Envie uma foto menor (até ~6 MB).'],
  ])('HTTP %s vira aviso com a mensagem da função (não trava o salvar)', async (status, msg) => {
    const response = new Response(JSON.stringify({ error: msg }), { status });
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'non-2xx', context: response } });
    const { result } = renderHook(() => useValidateReceipt());
    await act(() => result.current.validate(file, '2026-10-10', 5000));
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe(msg);
  });

  it('429 sem corpo legível ainda dá aviso em pt-BR', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'x', context: new Response('oops', { status: 429 }) } });
    const { result } = renderHook(() => useValidateReceipt());
    await act(() => result.current.validate(file, '2026-10-10', 5000));
    expect(result.current.errorMessage).toMatch(/^Limite de leituras automáticas/);
  });

  it('envia o base64 e o tipo preparados para a leitura', async () => {
    invoke.mockResolvedValueOnce({ data: read, error: null });
    const { result } = renderHook(() => useValidateReceipt());
    await act(() => result.current.validate(file, '2026-10-10', 5000));
    expect(invoke).toHaveBeenCalledWith('validate-receipt', { body: { image_base64: 'YWJj', mime_type: 'image/jpeg' } });
  });
});

describe('leitura duvidosa: o que conferir', () => {
  const base = {
    extracted_date: '2026-10-10',
    extracted_amount_cents: 5000,
    confidence: 'high',
    amount_confidence: 'high',
    date_confidence: 'high',
    issues: [] as string[],
  };

  it('leitura confiável não pede conferência', () => {
    expect(readingReview(toValidationResult(base))).toEqual({
      amount: false, date: false, notAReceipt: false, messages: [],
    });
    expect(readingReview(null)).toMatchObject({ amount: false, date: false });
  });

  it('confiança média ou baixa marca só o campo em dúvida', () => {
    expect(readingReview(toValidationResult({ ...base, amount_confidence: 'medium' }))).toMatchObject({ amount: true, date: false });
    expect(readingReview(toValidationResult({ ...base, date_confidence: 'low' }))).toMatchObject({ amount: false, date: true });
  });

  it('cada problema da foto vira uma frase curta em pt-BR', () => {
    const r = readingReview(toValidationResult({ ...base, issues: ['blurry', 'cropped', 'multiple_totals', 'other'] }));
    expect(r.amount).toBe(true);
    expect(r.date).toBe(true);
    expect(r.messages).toEqual([
      'Foto tremida — confira os valores',
      'Nota cortada — confira o total',
      'Mais de um total na nota — confira o valor',
    ]);
  });

  it('mais de um total só põe o valor em dúvida', () => {
    expect(readingReview(toValidationResult({ ...base, issues: ['multiple_totals'] }))).toMatchObject({ amount: true, date: false });
  });

  it('resposta antiga (só confiança geral) herda a confiança nos campos', () => {
    const r = toValidationResult({ extracted_date: '2026-10-10', extracted_amount_cents: 5000, confidence: 'medium' });
    expect(r.amount_confidence).toBe('medium');
    expect(r.issues).toEqual([]);
    expect(readingReview(r)).toMatchObject({ amount: true, date: true });
  });

  it('not_a_receipt: aviso claro e nada para preencher', async () => {
    invoke.mockResolvedValueOnce({
      data: { ...base, extracted_supplier: 'Foto do gato', issues: ['not_a_receipt'], model_used: 'gpt-4o' },
      error: null,
    });
    const { result } = renderHook(() => useValidateReceipt());
    await act(() => result.current.validate(file, '2026-10-10', 0));
    expect(result.current.status).toBe('warning');
    expect(result.current.divergences[0]).toMatch(/não parece um comprovante/);
    expect(result.current.result).toMatchObject({
      extracted_date: null, extracted_amount_cents: null, extracted_supplier: null, confidence: 'low',
    });
    expect(result.current.review).toEqual({
      amount: false, date: false, notAReceipt: true, messages: ['Isso não parece um comprovante'],
    });
  });

  it('expõe a revisão por campo e o modelo que leu', async () => {
    invoke.mockResolvedValueOnce({ data: { ...base, amount_confidence: 'low', model_used: 'gpt-4o' }, error: null });
    const { result } = renderHook(() => useValidateReceipt());
    await act(() => result.current.validate(file, '2026-10-10', 0));
    expect(result.current.review.amount).toBe(true);
    expect(result.current.result?.model_used).toBe('gpt-4o');
  });
});
