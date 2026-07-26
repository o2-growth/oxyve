import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type ValidationStatus = 'idle' | 'validating' | 'success' | 'warning' | 'error';

export type ReceiptType =
  | 'nota_fiscal'
  | 'recibo'
  | 'comprovante_pix'
  | 'comprovante_cartao'
  | 'outro';

export interface ValidationResult {
  extracted_date: string | null;
  extracted_amount_cents: number | null;
  extracted_cnpj: string | null;
  extracted_supplier: string | null;
  receipt_type: ReceiptType | null;
  confidence: 'high' | 'medium' | 'low';
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Remove the data:...;base64, prefix
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function formatCurrency(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

export function useValidateReceipt() {
  const [state, setState] = useState<ValidationState>({
    status: 'idle',
    result: null,
    divergences: [],
    errorMessage: null,
  });

  const validate = useCallback(async (
    file: File,
    formDate: string, // YYYY-MM-DD
    formAmountCents: number,
  ) => {
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

      const image_base64 = await fileToBase64(file);

      const { data, error } = await supabase.functions.invoke('validate-receipt', {
        body: { image_base64, mime_type: mimeType },
      });

      if (error) {
        setState({
          status: 'error',
          result: null,
          divergences: [],
          errorMessage: 'Não foi possível validar o comprovante.',
        });
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

      const result: ValidationResult = {
        extracted_date: data.extracted_date || null,
        extracted_amount_cents: data.extracted_amount_cents ?? null,
        extracted_cnpj: data.extracted_cnpj || null,
        extracted_supplier: data.extracted_supplier || null,
        receipt_type: data.receipt_type || null,
        confidence: data.confidence || 'low',
      };

      // Compare with form values
      const divergences: string[] = [];

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
    setState({ status: 'idle', result: null, divergences: [], errorMessage: null });
  }, []);

  return { ...state, validate, reset };
}
