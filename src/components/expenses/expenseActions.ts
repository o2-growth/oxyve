import type { Expense } from '@/hooks/useExpenses';

type ActionExpense = Pick<Expense, 'user_id' | 'status' | 'report' | 'late_decision'>;

/**
 * Regras de ação sobre uma despesa, as mesmas no menu individual e na seleção em lote.
 * Gestor vê as despesas da empresa: sem checar o dono, o lote levava despesas de
 * funcionários para o relatório do gestor (e o reembolso ia para ele).
 */

/** Só as próprias despesas entram na seleção em lote. */
export const canSelectExpense = (e: ActionExpense, userId: string | undefined): boolean =>
  !!userId && e.user_id === userId;

/** Rascunho próprio exclui, esteja ou não num relatório (aberto ou devolvido). */
export const canDeleteExpense = (e: ActionExpense, userId: string | undefined): boolean =>
  canSelectExpense(e, userId) && e.status === 'draft';

/**
 * Adicionar a relatório: rascunho próprio, avulso e sem decisão pendente do gestor.
 * Despesa "após o envio" (late_decision pending) é o gestor quem encaixa; adicionada
 * à mão ela acabava em dois relatórios.
 */
export const canAddExpenseToReport = (e: ActionExpense, userId: string | undefined): boolean =>
  canDeleteExpense(e, userId) && !e.report && e.late_decision !== 'pending';
