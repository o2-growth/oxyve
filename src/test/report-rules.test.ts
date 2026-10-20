/**
 * Regras compartilhadas de relatório: o que conta no reembolso, quando a fila
 * pode aprovar direto, rascunho do motivo de devolução e o texto do envio.
 */
import { describe, it, expect } from 'vitest';
import {
  reimbursableOf,
  summarizeReview,
  canApproveDirectly,
  canRejectDirectly,
  buildRejectionDraft,
  isReturnedReport,
  isAwaitingApprovalBy,
  buildSubmitConfirmText,
  payableExpenses,
} from '@/components/reports/reportRules';

describe('reimbursableOf', () => {
  it('usa o valor com teto quando existe', () => {
    expect(reimbursableOf({ amount_cents: 6000, reimbursable_cents: 3000, is_reimbursable: true })).toBe(3000);
  });

  it('cai no valor da nota sem reimbursable_cents', () => {
    expect(reimbursableOf({ amount_cents: 6000, reimbursable_cents: null, is_reimbursable: true })).toBe(6000);
  });

  it('não reembolsável vale 0 mesmo com reimbursable_cents gravado', () => {
    expect(reimbursableOf({ amount_cents: 3000, reimbursable_cents: 3000, is_reimbursable: false })).toBe(0);
  });

  it('reprovada na revisão vale 0', () => {
    expect(
      reimbursableOf({ amount_cents: 3000, reimbursable_cents: 3000, is_reimbursable: true }, 'rejected'),
    ).toBe(0);
  });

  it('status rejected (legado) vale 0', () => {
    expect(
      reimbursableOf({ amount_cents: 3000, reimbursable_cents: 3000, is_reimbursable: true, status: 'rejected' }),
    ).toBe(0);
  });
});

describe('summarizeReview / canApproveDirectly', () => {
  const ids = ['e1', 'e2', 'e3'];

  it('sem revisão nenhuma não aprova nem reprova direto', () => {
    const s = summarizeReview(ids, []);
    expect(s).toEqual({ total: 3, reviewed: 0, rejected: 0 });
    expect(canApproveDirectly(s)).toBe(false);
    expect(canRejectDirectly(s)).toBe(false);
  });

  it('revisão parcial não aprova', () => {
    const s = summarizeReview(ids, [
      { expense_id: 'e1', decision: 'approved' },
      { expense_id: 'e2', decision: 'approved' },
    ]);
    expect(canApproveDirectly(s)).toBe(false);
  });

  it('tudo revisado e aprovado: aprova direto', () => {
    const s = summarizeReview(ids, ids.map((id) => ({ expense_id: id, decision: 'approved' })));
    expect(canApproveDirectly(s)).toBe(true);
    expect(canRejectDirectly(s)).toBe(true);
  });

  it('item reprovado bloqueia aprovar, mas permite reprovar', () => {
    const s = summarizeReview(ids, [
      { expense_id: 'e1', decision: 'approved' },
      { expense_id: 'e2', decision: 'rejected' },
      { expense_id: 'e3', decision: 'approved' },
    ]);
    expect(s.rejected).toBe(1);
    expect(canApproveDirectly(s)).toBe(false);
    expect(canRejectDirectly(s)).toBe(true);
  });

  it('ignora revisão de despesa que saiu do relatório', () => {
    const s = summarizeReview(['e1'], [
      { expense_id: 'e1', decision: 'approved' },
      { expense_id: 'x', decision: 'rejected' },
    ]);
    expect(s).toEqual({ total: 1, reviewed: 1, rejected: 0 });
    expect(canApproveDirectly(s)).toBe(true);
  });

  it('relatório vazio não aprova', () => {
    expect(canApproveDirectly(summarizeReview([], []))).toBe(false);
  });
});

describe('buildRejectionDraft', () => {
  it('lista cada item reprovado com data e motivo', () => {
    const draft = buildRejectionDraft([
      { description: 'Almoço', date: '2026-10-05', comment: 'Nota ilegível' },
      { description: 'Uber', date: '2026-10-06', comment: null },
    ]);
    expect(draft).toContain('• Almoço (05/10/2026): Nota ilegível');
    expect(draft).toContain('• Uber (06/10/2026)');
    expect(draft).not.toContain('Uber (06/10/2026):');
  });

  it('sem item reprovado devolve vazio', () => {
    expect(buildRejectionDraft([])).toBe('');
  });
});

describe('isReturnedReport', () => {
  it('rascunho com motivo de devolução é devolvido', () => {
    expect(isReturnedReport({ status: 'draft', last_rejection_comment: 'Falta nota' })).toBe(true);
  });
  it('rascunho sem motivo (ou só espaços) não é', () => {
    expect(isReturnedReport({ status: 'draft', last_rejection_comment: null })).toBe(false);
    expect(isReturnedReport({ status: 'draft', last_rejection_comment: '   ' })).toBe(false);
  });
  it('reenviado não é mais devolvido', () => {
    expect(isReturnedReport({ status: 'submitted', last_rejection_comment: 'Falta nota' })).toBe(false);
  });
  it('status rejected legado conta como devolvido', () => {
    expect(isReturnedReport({ status: 'rejected', last_rejection_comment: null })).toBe(true);
  });
});

describe('isAwaitingApprovalBy', () => {
  it('conta todo relatório enviado, inclusive o próprio', () => {
    expect(isAwaitingApprovalBy({ status: 'submitted', user_id: 'a' }, 'me')).toBe(true);
    expect(isAwaitingApprovalBy({ status: 'submitted', user_id: 'me' }, 'me')).toBe(true);
    expect(isAwaitingApprovalBy({ status: 'draft', user_id: 'a' }, 'me')).toBe(false);
  });
});

describe('buildSubmitConfirmText', () => {
  const base = {
    title: 'Relatório Out 2026',
    count: 3,
    reimbursableCents: 12345,
    startDate: '2026-10-01',
    endDate: '2026-10-31',
  };

  it('mostra quantidade, valor e período', () => {
    const t = buildSubmitConfirmText({ ...base, today: '2026-10-31' });
    expect(t).toContain('3 despesas');
    expect(t).toMatch(/R\$\s?123,45/);
    expect(t).toContain('01/10/2026');
    expect(t).toContain('31/10/2026');
    expect(t).not.toContain('falta');
  });

  it('avisa quando o ciclo ainda não terminou', () => {
    const t = buildSubmitConfirmText({ ...base, count: 1, today: '2026-10-15' });
    expect(t).toContain('1 despesa');
    expect(t).toMatch(/faltam 16 dias/);
    expect(t).toMatch(/depois do envio/);
  });

  it('singular quando falta 1 dia', () => {
    const t = buildSubmitConfirmText({ ...base, today: '2026-10-30' });
    expect(t).toMatch(/falta 1 dia/);
  });
});

describe('payableExpenses', () => {
  it('paga só aprovada e reembolsável, com o valor do teto', () => {
    const { items, totalCents } = payableExpenses([
      { id: 'a', status: 'approved', amount_cents: 6000, reimbursable_cents: 3000, is_reimbursable: true },
      { id: 'b', status: 'approved', amount_cents: 5000, reimbursable_cents: 5000, is_reimbursable: false },
      { id: 'c', status: 'submitted', amount_cents: 1000, reimbursable_cents: 1000, is_reimbursable: true },
      { id: 'd', status: 'approved', amount_cents: 2000, reimbursable_cents: null, is_reimbursable: true },
    ]);
    expect(items.map((e) => e.id)).toEqual(['a', 'd']);
    expect(totalCents).toBe(5000);
  });
});
