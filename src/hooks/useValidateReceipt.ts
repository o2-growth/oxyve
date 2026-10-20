import { useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { prepareImageForOcr } from '@/lib/receiptImage';

export type ValidationStatus = 'idle' | 'validating' | 'success' | 'warning' | 'error';

export type ReceiptType =
  | 'nota_fiscal'
  | 'recibo'
  | 'comprovante_pix'
  | 'comprovante_cartao'
  | 'outro';

export type ReadConfidence = 'high' | 'medium' | 'low';

export type ReceiptIssue =
  | 'blurry'
  | 'cropped'
  | 'multiple_totals'
  | 'handwritten'
  | 'not_a_receipt'
  | 'low_light'
  | 'other';

export interface ValidationResult {
  extracted_date: string | null;
  extracted_amount_cents: number | null;
  extracted_cnpj: string | null;
  extracted_supplier: string | null;
  receipt_type: ReceiptType | null;
  confidence: ReadConfidence;
  amount_confidence: ReadConfidence;
  date_confidence: ReadConfidence;
  issues: ReceiptIssue[];
  /** Só informativo por enquanto (não escolhe categoria). */
  expense_kind_hint: 'food' | 'transport' | 'other' | null;
  model_used: string | null;
}

/** O que a pessoa precisa conferir antes de salvar o que a leitura trouxe. */
export interface ReadingReview {
  amount: boolean;
  date: boolean;
  notAReceipt: boolean;
  /** Uma frase curta por problema da foto, na ordem em que vieram. */
  messages: string[];
}

export const ISSUE_MESSAGES: Partial<Record<ReceiptIssue, string>> = {
  blurry: 'Foto tremida — confira os valores',
  cropped: 'Nota cortada — confira o total',
  multiple_totals: 'Mais de um total na nota — confira o valor',
  not_a_receipt: 'Isso não parece um comprovante',
  handwritten: 'Nota escrita à mão — confira os valores',
  low_light: 'Foto escura — confira os valores',
};

// Problemas que põem em dúvida o número lido. "Mais de um total" só afeta o valor.
const AMOUNT_ISSUES: ReceiptIssue[] = ['blurry', 'cropped', 'multiple_totals', 'handwritten', 'low_light'];
const DATE_ISSUES: ReceiptIssue[] = ['blurry', 'cropped', 'handwritten', 'low_light'];

const NO_REVIEW: ReadingReview = { amount: false, date: false, notAReceipt: false, messages: [] };

/**
 * Por campo, se a leitura pede conferência: confiança média/baixa ou problema
 * na foto. Sem leitura não há o que conferir.
 */
export function readingReview(result: ValidationResult | null): ReadingReview {
  if (!result) return NO_REVIEW;
  const issues = result.issues ?? [];
  const messages = issues.map((i) => ISSUE_MESSAGES[i]).filter((m): m is string => !!m);
  if (issues.includes('not_a_receipt')) {
    return { amount: false, date: false, notAReceipt: true, messages };
  }
  return {
    amount: result.amount_confidence !== 'high' || issues.some((i) => AMOUNT_ISSUES.includes(i)),
    date: result.date_confidence !== 'high' || issues.some((i) => DATE_ISSUES.includes(i)),
    notAReceipt: false,
    messages,
  };
}

const CONFIDENCES: ReadConfidence[] = ['high', 'medium', 'low'];
const asConfidence = (v: unknown): ReadConfidence | null =>
  CONFIDENCES.includes(v as ReadConfidence) ? (v as ReadConfidence) : null;

/** Resposta da função → resultado. Aceita a resposta antiga (sem confiança por campo). */
export function toValidationResult(data: Record<string, unknown>): ValidationResult {
  const confidence = asConfidence(data.confidence) ?? 'low';
  const issues = Array.isArray(data.issues) ? (data.issues as ReceiptIssue[]) : [];
  const notAReceipt = issues.includes('not_a_receipt');
  return {
    // Foto que não é comprovante não preenche nada, mesmo que a função mande algo.
    extracted_date: notAReceipt ? null : (data.extracted_date as string) || null,
    extracted_amount_cents: notAReceipt ? null : (data.extracted_amount_cents as number) ?? null,
    extracted_cnpj: notAReceipt ? null : (data.extracted_cnpj as string) || null,
    extracted_supplier: notAReceipt ? null : (data.extracted_supplier as string) || null,
    receipt_type: notAReceipt ? null : (data.receipt_type as ReceiptType) || null,
    confidence: notAReceipt ? 'low' : confidence,
    amount_confidence: asConfidence(data.amount_confidence) ?? confidence,
    date_confidence: asConfidence(data.date_confidence) ?? confidence,
    issues,
    expense_kind_hint: (data.expense_kind_hint as ValidationResult['expense_kind_hint']) ?? null,
    model_used: (data.model_used as string) ?? null,
  };
}

/**
 * Bloqueios de política sobre o comprovante (PO-0002 4.9.1 e 4.9.3), avaliados
 * no submit com a data FINAL do lançamento. Retorna os motivos que impedem
 * salvar — vazio se o comprovante está conforme (ou se a leitura foi incerta).
 */
export function receiptPolicyBlocks(
  result: ValidationResult | null,
  finalDateYMD: string,
): string[] {
  // Leitura de baixa confiança não bloqueia — evita falso positivo do OCR.
  if (!result || result.confidence === 'low') return [];
  const blocks: string[] = [];

  if (result.receipt_type === 'comprovante_pix') {
    blocks.push('Comprovante PIX não é aceito. Envie a nota fiscal (Política 4.9.3).');
  }
  if (result.receipt_type === 'comprovante_cartao') {
    blocks.push('Comprovante de cartão sem nota fiscal não é aceito (Política 4.9.3).');
  }
  if (!result.extracted_cnpj && result.receipt_type !== 'nota_fiscal') {
    blocks.push('O comprovante não tem CNPJ. É necessária nota fiscal com CNPJ (Política 4.9.3).');
  }
  if (result.extracted_date && result.extracted_date !== finalDateYMD) {
    blocks.push(
      `A data do comprovante (${formatDate(result.extracted_date)}) não corresponde ao dia da despesa (${formatDate(finalDateYMD)}) — Política 4.9.1.`,
    );
  }
  return blocks;
}

export interface ValidationState {
  status: ValidationStatus;
  result: ValidationResult | null;
  divergences: string[];
  errorMessage: string | null;
}

/**
 * Erro HTTP da função (supabase.functions.invoke devolve o Response em
 * error.context). 413 (foto grande) e 429 (cota de leituras) são aviso: a leitura
 * automática é ajuda, o lançamento segue com data e valor à mão.
 */
async function friendlyInvokeError(error: unknown): Promise<string> {
  const ctx = (error as { context?: unknown } | null)?.context as
    | { status?: number; clone?: () => { json: () => Promise<unknown> }; json?: () => Promise<unknown> }
    | undefined;
  const status = typeof ctx?.status === 'number' ? ctx.status : null;
  let serverMsg: string | null = null;
  try {
    const body = (await (ctx?.clone ? ctx.clone().json() : ctx?.json?.())) as { error?: unknown } | undefined;
    if (typeof body?.error === 'string' && body.error.trim()) serverMsg = body.error.trim();
  } catch {
    // Corpo sem JSON: fica a mensagem padrão do status.
  }
  if (status === 429) {
    return serverMsg ?? 'Limite de leituras automáticas atingido. Preencha data e valor à mão — a despesa pode ser salva normalmente.';
  }
  if (status === 413) {
    return serverMsg ?? 'Foto grande demais para a leitura automática. Preencha data e valor à mão — a despesa pode ser salva normalmente.';
  }
  return 'Não foi possível validar o comprovante.';
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function formatCurrency(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

export function useValidateReceipt() {
  const [state, setRawState] = useState<ValidationState>({
    status: 'idle',
    result: null,
    divergences: [],
    errorMessage: null,
  });

  // Só a leitura mais recente grava o estado: o form revalida quando data/valor mudam e
  // a IA pode responder fora de ordem (resposta antiga com divergência que já não vale).
  const requestIdRef = useRef(0);

  const validate = useCallback(async (
    file: File,
    formDate: string, // YYYY-MM-DD
    formAmountCents: number,
  ) => {
    const requestId = ++requestIdRef.current;
    const setState = (next: ValidationState) => {
      if (requestId === requestIdRef.current) setRawState(next);
    };
    setState({ status: 'validating', result: null, divergences: [], errorMessage: null });

    try {
      const mimeType = file.type;
      // Only support images for vision
      if (!mimeType.startsWith('image/')) {
        setState({
          status: 'error',
          result: null,
          divergences: [],
          errorMessage: 'Validação automática disponível apenas para imagens.',
        });
        return;
      }

      // Reduz no cliente (máx. 1600px, JPEG 0,8): foto de celular cheia batia no 413.
      const { base64: image_base64, mimeType: sentMime } = await prepareImageForOcr(file);

      const { data, error } = await supabase.functions.invoke('validate-receipt', {
        body: { image_base64, mime_type: sentMime },
      });

      if (error) {
        // 'error' só mostra o aviso; não trava o salvar.
        const errorMessage = await friendlyInvokeError(error);
        setState({ status: 'error', result: null, divergences: [], errorMessage });
        return;
      }

      if (data?.error) {
        setState({
          status: 'error',
          result: null,
          divergences: [],
          errorMessage: data.error,
        });
        return;
      }

      const result = toValidationResult(data ?? {});

      // Compare with form values
      const divergences: string[] = [];

      if (result.issues.includes('not_a_receipt')) {
        setState({
          status: 'warning',
          result,
          divergences: ['Isso não parece um comprovante. Tire outra foto da nota ou preencha à mão.'],
          errorMessage: null,
        });
        return;
      }

      if (result.confidence === 'low') {
        setState({ status: 'warning', result, divergences: ['Não foi possível ler o comprovante com clareza.'], errorMessage: null });
        return;
      }

      if (result.extracted_date && result.extracted_date !== formDate) {
        divergences.push(
          `Data no comprovante: ${formatDate(result.extracted_date)}, Data informada: ${formatDate(formDate)}`
        );
      }

      if (result.extracted_amount_cents != null && result.extracted_amount_cents !== formAmountCents) {
        divergences.push(
          `Valor no comprovante: ${formatCurrency(result.extracted_amount_cents)}, Valor informado: ${formatCurrency(formAmountCents)}`
        );
      }

      setState({
        status: divergences.length > 0 ? 'warning' : 'success',
        result,
        divergences,
        errorMessage: null,
      });
    } catch (err) {
      console.error('validate receipt error:', err);
      setState({
        status: 'error',
        result: null,
        divergences: [],
        errorMessage: 'Erro inesperado ao validar comprovante.',
      });
    }
  }, []);

  const reset = useCallback(() => {
    requestIdRef.current++;
    setRawState({ status: 'idle', result: null, divergences: [], errorMessage: null });
  }, []);

  // Identidade estável: o form usa o retorno em deps de useCallback/useEffect; um objeto
  // novo a cada render realimentava a validação (loop de chamadas à IA).
  const review = useMemo(() => readingReview(state.result), [state.result]);
  return useMemo(() => ({ ...state, review, validate, reset }), [state, review, validate, reset]);
}
