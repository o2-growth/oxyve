/**
 * Data da nota diferente do dia da despesa: não bloqueia, só avisa (o gestor vê o
 * selo). PIX, cartão sem NF e sem CNPJ continuam bloqueando.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { format, subDays, addDays } from 'date-fns';
import { receiptPolicyBlocks, receiptDateNotice, type ValidationResult } from '@/hooks/useValidateReceipt';
import { receiptDateDiffers, receiptDateHint } from '@/lib/receiptDate';

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
const today = ymd(new Date());
const br = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

const base: ValidationResult = {
  extracted_date: today,
  extracted_amount_cents: 5000,
  extracted_cnpj: '11222333000181',
  extracted_supplier: 'Rest',
  receipt_type: 'nota_fiscal',
  confidence: 'high',
  amount_confidence: 'high',
  date_confidence: 'high',
  issues: [],
  expense_kind_hint: null,
  model_used: null,
};

describe('receiptPolicyBlocks', () => {
  it('data divergente não bloqueia', () => {
    expect(receiptPolicyBlocks({ ...base, extracted_date: ymd(subDays(new Date(), 3)) })).toEqual([]);
  });
  it('PIX, cartão sem NF e sem CNPJ seguem bloqueando', () => {
    expect(receiptPolicyBlocks({ ...base, receipt_type: 'comprovante_pix' })[0]).toMatch(/PIX/);
    expect(receiptPolicyBlocks({ ...base, receipt_type: 'comprovante_cartao' })[0]).toMatch(/cartão/);
    expect(receiptPolicyBlocks({ ...base, receipt_type: 'recibo', extracted_cnpj: null })[0]).toMatch(/CNPJ/);
  });
});

describe('receiptDateNotice', () => {
  it('mesma data: sem aviso', () => {
    expect(receiptDateNotice(base, today)).toBeNull();
  });
  it('data diferente dentro da janela: aviso amarelo para quem lança', () => {
    const d = ymd(subDays(new Date(), 3));
    expect(receiptDateNotice({ ...base, extracted_date: d }, today)).toBe(
      `A data da nota (${br(d)}) é diferente da data da despesa. O gestor verá esse aviso.`,
    );
  });
  it('nota fora da janela de 20 dias: despesa fica com hoje', () => {
    const d = ymd(subDays(new Date(), 29));
    expect(receiptDateNotice({ ...base, extracted_date: d }, today)).toBe(
      `A nota é de ${br(d)} (fora da janela de 20 dias). A despesa fica com a data de hoje e o gestor verá o aviso.`,
    );
    expect(receiptDateNotice({ ...base, extracted_date: ymd(addDays(new Date(), 2)) }, today)).toMatch(/fora da janela/);
  });
});

describe('selo do gestor', () => {
  it('só quando a data da nota existe e difere', () => {
    expect(receiptDateDiffers('2026-09-21', '2026-10-20')).toBe(true);
    expect(receiptDateDiffers('2026-10-20', '2026-10-20')).toBe(false);
    expect(receiptDateDiffers(null, '2026-10-20')).toBe(false);
    expect(receiptDateHint('2026-09-21', '2026-10-20')).toBe('Nota de 21/09/2026 · despesa em 20/10/2026');
  });
});
