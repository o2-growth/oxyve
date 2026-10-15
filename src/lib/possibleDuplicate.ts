/**
 * Possível duplicidade (decisão 3 da rodada 4): mesma data + valor + categoria do
 * mesmo usuário não bloqueia mais. O banco salva e grava em
 * expenses.possible_duplicate_of o id da despesa mais antiga que coincide; quem
 * lança é avisado e o gestor vê o selo na revisão. Comprovante repetido
 * (receipt_hash) continua bloqueado no banco.
 */
import { formatCurrency, formatDate } from '@/lib/constants';

export const POSSIBLE_DUPLICATE_LABEL = 'Possível duplicidade';

/** Aviso para quem acabou de lançar (toast.warning). */
export function possibleDuplicateWarning(expense?: { amount_cents?: number | null; date?: string | null } | null): string {
  const detalhe =
    expense?.amount_cents != null && expense?.date
      ? ` (${formatCurrency(expense.amount_cents)} em ${formatDate(expense.date)})`
      : '';
  return `Já existe uma despesa com mesma data, valor e categoria${detalhe} — ela foi salva e o gestor verá o alerta de possível duplicidade.`;
}

/** Texto do selo para o gestor: diz qual é a outra despesa quando ela está à mão. */
export function possibleDuplicateHint(other?: { description?: string | null; date?: string | null } | null): string {
  if (!other?.date && !other?.description) {
    return 'Há outra despesa da mesma pessoa com mesma data, valor e categoria.';
  }
  const quando = other.date ? ` de ${formatDate(other.date)}` : '';
  const qual = other.description?.trim() ? `"${other.description.trim()}"` : 'outra despesa';
  return `Mesma data, valor e categoria de ${qual}${quando}.`;
}
