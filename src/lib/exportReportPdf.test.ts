/**
 * Sprint 3 — sanity test do gerador de PDF.
 *
 * Não tentamos fazer parse do PDF — apenas garantimos que `generateReportPdf`
 * retorna um Blob não-vazio com mime correto. Isso já cobre 99% dos
 * smoke-failures (import quebrado, autoTable não anexando, etc).
 */
import { describe, it, expect } from 'vitest';
import { generateReportPdf, aggregateByCategory } from './exportReportPdf';
import type { ExportableReport } from './exportReport';

const fixture: ExportableReport = {
  title: 'Relatório de Abril 2026',
  authorName: 'Andrey Lopes',
  status: 'submitted',
  startDate: '2026-04-01',
  endDate: '2026-04-30',
  totalCents: 250000,
  reimbursableCents: 200000,
  expenses: [
    {
      date: '2026-04-05',
      description: 'Almoço cliente',
      category: 'Refeição',
      costCenter: 'Comercial',
      paymentMethod: 'credit_card',
      amountCents: 12000,
      currency: 'BRL',
    },
    {
      date: '2026-04-15',
      description: 'Uber aeroporto',
      category: 'Transporte',
      costCenter: 'Comercial',
      paymentMethod: 'cash',
      amountCents: 8000,
      currency: 'BRL',
    },
  ],
};

describe('exportReportPdf', () => {
  it('gera Blob não-vazio do tipo PDF', () => {
    const blob = generateReportPdf(fixture);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(500);
    expect(blob.type).toBe('application/pdf');
  });

  it('lida com relatório sem despesas', () => {
    const empty: ExportableReport = {
      title: 'Vazio',
      totalCents: 0,
      expenses: [],
    };
    const blob = generateReportPdf(empty);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(500);
  });
});

describe('aggregateByCategory', () => {
  it('soma o reembolsável e deixa a reprovada de fora', () => {
    const buckets = aggregateByCategory({
      title: 'x',
      totalCents: 14000,
      reimbursableCents: 3000,
      expenses: [
        { date: '2026-10-01', description: 'Almoço', category: 'Alimentação', costCenter: null, paymentMethod: 'cash', amountCents: 6000, reimbursableCents: 3000, situation: 'capped' },
        { date: '2026-10-02', description: 'Jantar', category: 'Alimentação', costCenter: null, paymentMethod: 'cash', amountCents: 8000, reimbursableCents: 0, situation: 'rejected' },
      ],
    });
    expect(buckets).toEqual([{ name: 'Alimentação', totalCents: 3000, count: 1 }]);
  });
});
