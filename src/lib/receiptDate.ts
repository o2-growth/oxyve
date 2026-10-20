/**
 * Data da nota diferente do dia da despesa (PO-0002 4.9.1): não bloqueia mais o
 * lançamento. O app grava a data lida da nota em expenses.receipt_date; quem lança
 * vê um aviso e o gestor vê o selo na revisão.
 */
import { formatDate, MAX_EXPENSE_AGE_DAYS, endOfToday, minExpenseDate, parseDateOnly } from '@/lib/constants';

export const RECEIPT_DATE_MISMATCH_LABEL = 'Data da nota diferente';

/** Data da nota existe e é outra que a da despesa. */
export function receiptDateDiffers(receiptDate: string | null | undefined, expenseDate: string | null | undefined): boolean {
  return !!receiptDate && !!expenseDate && receiptDate !== expenseDate;
}

/** Dica do selo para o gestor. */
export function receiptDateHint(receiptDate: string, expenseDate: string): string {
  return `Nota de ${formatDate(receiptDate)} · despesa em ${formatDate(expenseDate)}`;
}

/** Aviso (não bloqueante) para quem lança. */
export function receiptDateWarning(receiptDate: string): string {
  return `A data da nota (${formatDate(receiptDate)}) é diferente da data da despesa. O gestor verá esse aviso.`;
}

/** Data da nota (YYYY-MM-DD) dentro da janela de lançamento (hoje até 20 dias atrás). */
export function receiptDateInWindow(receiptDate: string): boolean {
  const d = parseDateOnly(receiptDate);
  return d <= endOfToday() && d >= minExpenseDate();
}

/** Aviso quando a nota está fora da janela e a despesa fica com a data de hoje. */
export function receiptOutOfWindowWarning(receiptDate: string): string {
  return `A nota é de ${formatDate(receiptDate)} (fora da janela de ${MAX_EXPENSE_AGE_DAYS} dias). A despesa fica com a data de hoje e o gestor verá o aviso.`;
}
