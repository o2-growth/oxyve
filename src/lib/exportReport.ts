/**
 * Sprint 2 — GAP-G009: Export de relatórios em CSV e XLSX.
 *
 * Pure utilities, sem deps de DOM além do trigger de download (que é
 * isolado em `triggerDownload`). Idempotente, testável.
 *
 * Colunas exigidas pelo CTO charter / VExpenses parity:
 *   Data | Descrição | Tipo (categoria) | Centro de custos
 *   | Forma de pagamento | Valor da nota | Valor reembolsável | Situação
 *
 * Nota e reembolsável ficam separados: o pagamento usa o reembolsável (teto,
 * reprovada na revisão e não reembolsável zerados), e quem concilia pelo arquivo
 * precisa ver o mesmo número da tela.
 *
 * O XLSX gera 2 sheets: "Despesas" + "Resumo" (com totais).
 */

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { PAYMENT_METHOD_LABELS, formatCurrency } from '@/lib/constants';

export interface ExportableExpenseRow {
  date: string;
  description: string;
  category: string | null;
  costCenter: string | null;
  paymentMethod: string;
  amountCents: number;
  /** Quanto entra no reembolso. Sem informar, vale o valor da nota. */
  reimbursableCents?: number;
  situation?: ExpenseSituation;
  currency?: string | null;
}

export type ExpenseSituation = 'ok' | 'capped' | 'rejected' | 'not_reimbursable';

export const SITUATION_LABELS: Record<ExpenseSituation, string> = {
  ok: 'Reembolsável',
  capped: 'Limitada ao teto',
  rejected: 'Reprovada na revisão',
  not_reimbursable: 'Não reembolsável',
};

export interface ExportableReport {
  title: string;
  authorName?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  totalCents: number;
  reimbursableCents?: number;
  /** Por que parte do lançado não entra no reembolso (mesma conta da tela). */
  breakdown?: {
    rejectedCents: number;
    cappedCents: number;
    notReimbursableCents: number;
  };
  expenses: ExportableExpenseRow[];
}

const HEADERS = [
  'Data',
  'Descrição',
  'Tipo',
  'Centro de custos',
  'Forma de pagamento',
  'Valor da nota',
  'Valor reembolsável',
  'Situação',
] as const;

function formatDateBR(iso: string): string {
  // Aceita 'YYYY-MM-DD' direto pra evitar timezone-shift que `new Date(iso)` traria.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  try {
    return new Intl.DateTimeFormat('pt-BR').format(new Date(iso));
  } catch {
    return iso;
  }
}

function paymentLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] || method;
}

function amountString(cents: number, currency?: string | null): string {
  return formatCurrency(cents, currency || 'BRL');
}

/**
 * Monta as linhas (string-only) prontas para CSV/XLSX.
 * Exposto pra testes.
 */
export function buildRows(report: ExportableReport): string[][] {
  const body = report.expenses.map((e) => [
    formatDateBR(e.date),
    e.description,
    e.category || '-',
    e.costCenter || '-',
    paymentLabel(e.paymentMethod),
    amountString(e.amountCents, e.currency),
    amountString(e.reimbursableCents ?? e.amountCents, e.currency),
    SITUATION_LABELS[e.situation ?? 'ok'],
  ]);
  return [HEADERS as unknown as string[], ...body];
}

/**
 * Gera CSV (string) usando papaparse — aspas e escapes corretos.
 */
export function generateCsv(report: ExportableReport): string {
  const rows = buildRows(report);
  return Papa.unparse(rows, { quotes: true });
}

/**
 * Gera Workbook XLSX em memória com 2 sheets:
 *  1. "Despesas" — mesmas colunas do CSV.
 *  2. "Resumo" — total / reembolsável / nº despesas.
 */
export function generateXlsx(report: ExportableReport): XLSX.WorkBook {
  const rows = buildRows(report);
  const ws = XLSX.utils.aoa_to_sheet(rows);

  const cur = report.expenses[0]?.currency || 'BRL';
  const reimb = report.reimbursableCents ?? 0;
  const out: (string | number)[][] = report.breakdown
    ? [
        ['Reprovado na revisão', amountString(report.breakdown.rejectedCents, cur)],
        ['Acima do teto', amountString(report.breakdown.cappedCents, cur)],
        ['Não reembolsável', amountString(report.breakdown.notReimbursableCents, cur)],
      ]
    : [['Fora do reembolso', amountString(report.totalCents - reimb, cur)]];
  const summary: (string | number)[][] = [
    ['Relatório', report.title],
    ['Autor', report.authorName || '-'],
    ['Status', report.status || '-'],
    ['Período', report.startDate && report.endDate
      ? `${formatDateBR(report.startDate)} - ${formatDateBR(report.endDate)}`
      : '-'],
    ['Despesas', report.expenses.length],
    ['Total lançado (notas)', amountString(report.totalCents, cur)],
    ['Reembolsável', amountString(reimb, cur)],
    ...out,
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summary);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Despesas');
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo');
  return wb;
}

/** Sanitiza filename — sem caracteres especiais. */
export function sanitizeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'relatorio';
}

function triggerDownload(blob: Blob, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadReportCsv(report: ExportableReport): void {
  const csv = generateCsv(report);
  // BOM pra Excel-pt-BR abrir UTF-8 corretamente.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${sanitizeFilename(report.title)}.csv`);
}

export function downloadReportXlsx(report: ExportableReport): void {
  const wb = generateXlsx(report);
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  triggerDownload(blob, `${sanitizeFilename(report.title)}.xlsx`);
}
