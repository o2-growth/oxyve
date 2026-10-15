/**
 * Sprint 2 — Dex: testes puros pro generator de CSV/XLSX.
 * Não tocam em DOM/localStorage — só lib code.
 */
import { describe, it, expect } from 'vitest';
import {
  buildRows,
  generateCsv,
  generateXlsx,
  sanitizeFilename,
  ExportableReport,
} from './exportReport';

const sampleReport: ExportableReport = {
  title: 'Viagem São Paulo - Janeiro/2026',
  authorName: 'Andrey Lopes',
  status: 'submitted',
  startDate: '2026-01-10',
  endDate: '2026-01-15',
  totalCents: 35050,
  reimbursableCents: 25000,
  expenses: [
    {
      date: '2026-01-10',
      description: 'Uber para aeroporto',
      category: 'Transporte',
      costCenter: 'Comercial',
      paymentMethod: 'personal_card',
      amountCents: 8500,
      currency: 'BRL',
    },
    {
      date: '2026-01-11',
      description: 'Almoço, cliente "X"',
      category: 'Refeição',
      costCenter: null,
      paymentMethod: 'corporate_card',
      amountCents: 12550,
      currency: 'BRL',
    },
    {
      date: '2026-01-12',
      description: 'Estadia',
      category: null,
      costCenter: 'Comercial',
      paymentMethod: 'cash',
      amountCents: 14000,
      currency: 'BRL',
    },
  ],
};

describe('buildRows', () => {
  it('inclui cabeçalho + 1 linha por despesa', () => {
    const rows = buildRows(sampleReport);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual([
      'Data',
      'Descrição',
      'Tipo',
      'Centro de custos',
      'Forma de pagamento',
      'Valor da nota',
      'Valor reembolsável',
      'Situação',
    ]);
  });

  it('formata data como dd/MM/yyyy', () => {
    const [, firstRow] = buildRows(sampleReport);
    expect(firstRow[0]).toBe('10/01/2026');
  });

  it('substitui categoria/cc nulos por "-"', () => {
    const rows = buildRows(sampleReport);
    expect(rows[2][3]).toBe('-'); // costCenter null
    expect(rows[3][2]).toBe('-'); // category null
  });

  it('traduz forma de pagamento', () => {
    const rows = buildRows(sampleReport);
    expect(rows[1][4]).toBe('Cartão Pessoal');
    expect(rows[2][4]).toBe('Cartão Corporativo');
    expect(rows[3][4]).toBe('Dinheiro');
  });

  it('formata valor como moeda BRL', () => {
    const rows = buildRows(sampleReport);
    expect(rows[1][5]).toMatch(/R\$/);
    expect(rows[1][5]).toMatch(/85,00/);
  });
});

describe('generateCsv', () => {
  it('produz string com aspas e escape correto', () => {
    const csv = generateCsv(sampleReport);
    expect(csv).toContain('Data');
    expect(csv).toContain('Uber para aeroporto');
    // Descrição com aspas é escapada — papaparse usa "" pra escapar.
    expect(csv).toContain('Almoço, cliente ""X""');
  });

  it('usa CRLF (\\r\\n) entre linhas — padrão Excel', () => {
    const csv = generateCsv(sampleReport);
    expect(csv.split('\r\n').length).toBeGreaterThanOrEqual(4);
  });
});

describe('generateXlsx', () => {
  it('cria workbook com sheets Despesas + Resumo', () => {
    const wb = generateXlsx(sampleReport);
    expect(wb.SheetNames).toEqual(['Despesas', 'Resumo']);
  });

  it('Resumo contém total e contagem', () => {
    const wb = generateXlsx(sampleReport);
    const resumo = wb.Sheets['Resumo'];
    // A1 = "Relatório", B1 = título.
    expect(resumo['A1']?.v).toBe('Relatório');
    expect(resumo['B1']?.v).toBe(sampleReport.title);
    // Despesas count.
    const cellWithCount = Object.values(resumo).find(
      (c) => typeof c === 'object' && c !== null && 'v' in (c as object) && (c as { v: unknown }).v === 3
    );
    expect(cellWithCount).toBeTruthy();
  });
});

describe('sanitizeFilename', () => {
  it('remove acentos e espaços', () => {
    expect(sanitizeFilename('Viagem São Paulo / Janeiro')).toBe('Viagem_Sao_Paulo_Janeiro');
  });

  it('fallback para "relatorio" se nome vazio', () => {
    expect(sanitizeFilename('***')).toBe('relatorio');
  });

  it('limita a 80 caracteres', () => {
    const long = 'a'.repeat(200);
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(80);
  });
});

// Relatório com os quatro casos: normal, teto, reprovada na revisão e não reembolsável.
const mixedReport: ExportableReport = {
  title: 'Relatório Out 2026',
  status: 'submitted',
  totalCents: 6000 + 2000 + 5000 + 1000,
  reimbursableCents: 3000 + 2000,
  breakdown: { rejectedCents: 5000, cappedCents: 3000, notReimbursableCents: 1000 },
  expenses: [
    { date: '2026-10-01', description: 'Almoço', category: 'Alimentação', costCenter: null, paymentMethod: 'personal_card', amountCents: 6000, reimbursableCents: 3000, situation: 'capped' },
    { date: '2026-10-02', description: 'Uber', category: 'Transporte', costCenter: null, paymentMethod: 'personal_card', amountCents: 2000, reimbursableCents: 2000, situation: 'ok' },
    { date: '2026-10-03', description: 'Hotel', category: null, costCenter: null, paymentMethod: 'personal_card', amountCents: 5000, reimbursableCents: 0, situation: 'rejected' },
    { date: '2026-10-04', description: 'Táxi empresa', category: null, costCenter: null, paymentMethod: 'corporate_card', amountCents: 1000, reimbursableCents: 0, situation: 'not_reimbursable' },
  ],
};

const centsOf = (s: string) => Number(s.replace(/[^\d]/g, ''));

describe('valores da nota x reembolsável (E4)', () => {
  it('cada linha traz nota, reembolsável e situação', () => {
    const rows = buildRows(mixedReport);
    expect(rows[1].slice(5)).toEqual([expect.stringMatching(/60,00/), expect.stringMatching(/30,00/), 'Limitada ao teto']);
    expect(rows[2][7]).toBe('Reembolsável');
    expect(rows[3].slice(6)).toEqual([expect.stringMatching(/0,00/), 'Reprovada na revisão']);
    expect(rows[4][7]).toBe('Não reembolsável');
  });

  it('soma da coluna reembolsável bate com o total reembolsável', () => {
    const rows = buildRows(mixedReport).slice(1);
    const soma = rows.reduce((s, r) => s + centsOf(r[6]), 0);
    expect(soma).toBe(mixedReport.reimbursableCents);
    const somaNotas = rows.reduce((s, r) => s + centsOf(r[5]), 0);
    expect(somaNotas).toBe(mixedReport.totalCents);
  });

  it('linha sem reembolsável informado cai no valor da nota', () => {
    const rows = buildRows(sampleReport);
    expect(rows[1][6]).toBe(rows[1][5]);
  });

  it('Resumo separa reprovado, teto e não reembolsável', () => {
    const wb = generateXlsx(mixedReport);
    const resumo = wb.Sheets['Resumo'];
    const linhas: Record<string, string> = {};
    for (let i = 1; i <= 20; i++) {
      const a = resumo[`A${i}`]?.v;
      if (typeof a === 'string') linhas[a] = String(resumo[`B${i}`]?.v ?? '');
    }
    expect(linhas['Total lançado (notas)']).toMatch(/140,00/);
    expect(linhas['Reembolsável']).toMatch(/50,00/);
    expect(linhas['Reprovado na revisão']).toMatch(/50,00/);
    expect(linhas['Acima do teto']).toMatch(/30,00/);
    expect(linhas['Não reembolsável']).toMatch(/10,00/);
  });
});
