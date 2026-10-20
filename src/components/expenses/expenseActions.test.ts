import { describe, it, expect } from 'vitest';
import { canSelectExpense, canDeleteExpense, canAddExpenseToReport } from './expenseActions';

const e = (over: Partial<Parameters<typeof canAddExpenseToReport>[0]> = {}) => ({
  user_id: 'u1',
  status: 'draft' as const,
  report: null,
  late_decision: null,
  ...over,
});

describe('regras de ação da despesa', () => {
  it('despesa de outra pessoa não é selecionável nem entra no relatório (gestor)', () => {
    const other = e({ user_id: 'u2' });
    expect(canSelectExpense(other, 'u1')).toBe(false);
    expect(canDeleteExpense(other, 'u1')).toBe(false);
    expect(canAddExpenseToReport(other, 'u1')).toBe(false);
  });

  it('avulsa com decisão pendente do gestor não pode ser adicionada à mão', () => {
    expect(canAddExpenseToReport(e({ late_decision: 'pending' }), 'u1')).toBe(false);
  });

  it('já em relatório não adiciona, mas rascunho ainda exclui', () => {
    const inReport = e({ report: { id: 'r1', title: 'R', status: 'draft' } });
    expect(canAddExpenseToReport(inReport, 'u1')).toBe(false);
    expect(canDeleteExpense(inReport, 'u1')).toBe(true);
  });

  it('enviada não exclui nem adiciona', () => {
    const sent = e({ status: 'submitted' });
    expect(canDeleteExpense(sent, 'u1')).toBe(false);
    expect(canAddExpenseToReport(sent, 'u1')).toBe(false);
  });

  it('rascunho próprio avulso pode tudo', () => {
    expect(canAddExpenseToReport(e(), 'u1')).toBe(true);
  });

  it('sem usuário carregado, nada', () => {
    expect(canSelectExpense(e(), undefined)).toBe(false);
  });
});
