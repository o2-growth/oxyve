/**
 * Regras de relatório usadas em mais de uma tela (Fila, Detalhe, Início, Gestão).
 * Uma fonte só: antes cada tela tinha a sua conta e os números não batiam.
 */
import { differenceInCalendarDays } from 'date-fns';
import { formatCurrency, formatDate, parseDateOnly } from '@/lib/constants';

export type ReviewDecision = 'approved' | 'rejected' | string | null | undefined;

export interface ReimbursableExpense {
  amount_cents: number | null;
  reimbursable_cents: number | null;
  is_reimbursable?: boolean | null;
  status?: string | null;
}

/**
 * Quanto a despesa entra no reembolso, em centavos. Zero quando não é
 * reembolsável (ex.: cartão da empresa), foi reprovada na revisão do gestor ou
 * tem status 'rejected' (legado). O banco grava reimbursable_cents = nota mesmo
 * para não reembolsável, então o flag precisa ser lido aqui.
 */
export function reimbursableOf(expense: ReimbursableExpense, review?: ReviewDecision): number {
  if (expense.is_reimbursable === false) return 0;
  if (review === 'rejected' || expense.status === 'rejected') return 0;
  return expense.reimbursable_cents ?? expense.amount_cents ?? 0;
}

export interface ReviewSummary {
  total: number;
  reviewed: number;
  rejected: number;
}

/** Conta a revisão item a item só das despesas que estão no relatório. */
export function summarizeReview(
  expenseIds: string[],
  reviews: Array<{ expense_id: string; decision: string | null }>,
): ReviewSummary {
  const byId = new Map(reviews.map((r) => [r.expense_id, r.decision]));
  let reviewed = 0;
  let rejected = 0;
  for (const id of expenseIds) {
    const d = byId.get(id);
    if (!d) continue;
    reviewed += 1;
    if (d === 'rejected') rejected += 1;
  }
  return { total: expenseIds.length, reviewed, rejected };
}

/** Mesma regra do Detalhe: tudo revisado e nenhum item reprovado. */
export function canApproveDirectly(s: ReviewSummary): boolean {
  return s.total > 0 && s.reviewed >= s.total && s.rejected === 0;
}

/** O Detalhe só libera "Reprovar" depois de revisar todos os itens. */
export function canRejectDirectly(s: ReviewSummary): boolean {
  return s.total > 0 && s.reviewed >= s.total;
}

/**
 * Rascunho do motivo da devolução com os itens reprovados na revisão. O banco
 * apaga as revisões ao devolver, então o motivo por item só chega ao autor se
 * estiver no comentário do relatório.
 */
export function buildRejectionDraft(
  items: Array<{ description: string; date: string; comment?: string | null }>,
): string {
  if (items.length === 0) return '';
  const lines = items.map((it) => {
    const motivo = it.comment?.trim();
    const quando = it.date ? ` (${formatDate(it.date)})` : '';
    return `• ${it.description.trim()}${quando}${motivo ? `: ${motivo}` : ''}`;
  });
  return `Despesas reprovadas na revisão:\n${lines.join('\n')}`;
}

/**
 * Devolvido = voltou para rascunho com motivo. A reprovação do relatório passa
 * por 'rejected' e volta a 'draft' na mesma transação; 'rejected' só sobra em
 * dado antigo, que também é devolução.
 */
export function isReturnedReport(r: { status: string; last_rejection_comment?: string | null }): boolean {
  if (r.status === 'rejected') return true;
  return r.status === 'draft' && !!r.last_rejection_comment?.trim();
}

/** Fila de aprovação: enviado e de outra pessoa (mesmo critério dos contadores). */
export function isAwaitingApprovalBy(r: { status: string; user_id: string }, userId: string | undefined): boolean {
  return r.status === 'submitted' && r.user_id !== userId;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Texto da confirmação de envio. Envio antes do fim do ciclo é permitido (decisão
 * pendente), mas o autor precisa saber que o que lançar depois vira pendência
 * do gestor.
 */
export function buildSubmitConfirmText(input: {
  title: string;
  count: number;
  reimbursableCents: number;
  startDate: string;
  endDate: string;
  today?: string | null;
}): string {
  const base = `Enviar "${input.title}" com ${plural(input.count, 'despesa', 'despesas')}, ${formatCurrency(input.reimbursableCents)} a reembolsar, período de ${formatDate(input.startDate)} a ${formatDate(input.endDate)}?`;
  if (!input.today) return base;
  const left = differenceInCalendarDays(
    parseDateOnly(input.endDate.slice(0, 10)),
    parseDateOnly(input.today.slice(0, 10)),
  );
  if (left <= 0) return base;
  return `${base} O ciclo ainda não terminou (${left === 1 ? 'falta 1 dia' : `faltam ${left} dias`}): despesas lançadas depois do envio ficam para decisão do gestor.`;
}

/** O que a Gestão pode pagar de uma pessoa: aprovado e reembolsável. */
export function payableExpenses<T extends ReimbursableExpense & { id: string; status: string }>(
  expenses: T[],
): { items: T[]; totalCents: number } {
  const items = expenses.filter((e) => e.status === 'approved' && e.is_reimbursable !== false);
  return { items, totalCents: items.reduce((s, e) => s + reimbursableOf(e), 0) };
}
