/**
 * Sprint 3 — GAP-G009 parte 2: Export de relatório em PDF.
 *
 * Implementação client-side com jsPDF + jspdf-autotable. Sem edge fn, sem
 * puppeteer, sem dependência de servidor — tudo roda no browser do user.
 *
 * Layout:
 *   - Cabeçalho com nome da org (se disponível) + título do relatório + status
 *   - 4 KPIs em linha: Total / Reembolsável / Não-reembolsável / Despesas
 *   - Tabela de despesas: Data, Descrição, Tipo, CC, Forma pagto, Valor
 *   - Sumário por categoria (% e valor)
 *   - Footer com data de geração
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PAYMENT_METHOD_LABELS, formatCurrency } from '@/lib/constants';
import type { ExportableReport } from '@/lib/exportReport';

interface ExtendedReport extends ExportableReport {
  orgName?: string | null;
}

function formatDateBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  try {
    return new Intl.DateTimeFormat('pt-BR').format(new Date(iso));
  } catch {
    return iso;
  }
}

function paymentLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] || method;
}

function statusLabel(status?: string | null): string {
  if (!status) return '-';
  const map: Record<string, string> = {
    draft: 'Rascunho',
    submitted: 'Enviado',
    approved: 'Aprovado',
    rejected: 'Reprovado',
    paid: 'Pago',
  };
  return map[status] ?? status;
}

function sanitizeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'relatorio';
}

interface CategoryAgg {
  name: string;
  totalCents: number;
  count: number;
}

function aggregateByCategory(report: ExportableReport): CategoryAgg[] {
  const map = new Map<string, CategoryAgg>();
  for (const e of report.expenses) {
    const key = e.category || 'Sem categoria';
    const cur = map.get(key) ?? { name: key, totalCents: 0, count: 0 };
    cur.totalCents += e.amountCents || 0;
    cur.count += 1;
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.totalCents - a.totalCents);
}

/**
 * Gera o PDF e retorna o Blob. Não dispara download — o caller decide.
 * Exposto pra testes.
 */
export function generateReportPdf(report: ExtendedReport): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 36;
  const pageWidth = doc.internal.pageSize.getWidth();
  let cursorY = margin;

  // Header
  if (report.orgName) {
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(report.orgName, margin, cursorY);
    cursorY += 14;
  }

  doc.setFontSize(18);
  doc.setTextColor(20);
  doc.text(report.title, margin, cursorY);
  cursorY += 22;

  doc.setFontSize(10);
  doc.setTextColor(80);
  const subtitleParts: string[] = [];
  if (report.authorName) subtitleParts.push(`Autor: ${report.authorName}`);
  subtitleParts.push(`Status: ${statusLabel(report.status)}`);
  if (report.startDate && report.endDate) {
    subtitleParts.push(`Período: ${formatDateBR(report.startDate)} – ${formatDateBR(report.endDate)}`);
  }
  doc.text(subtitleParts.join('  •  '), margin, cursorY);
  cursorY += 18;

  // KPI cards (4 colunas)
  const reimbursable = report.reimbursableCents ?? 0;
  const nonReimbursable = (report.totalCents ?? 0) - reimbursable;
  const kpis: Array<[string, string]> = [
    ['Total', formatCurrency(report.totalCents)],
    ['Reembolsável', formatCurrency(reimbursable)],
    ['Não reembolsável', formatCurrency(nonReimbursable)],
    ['Despesas', String(report.expenses.length)],
  ];

  const cardW = (pageWidth - margin * 2 - 18) / 4;
  const cardH = 50;
  kpis.forEach(([label, value], idx) => {
    const x = margin + idx * (cardW + 6);
    doc.setDrawColor(220);
    doc.setFillColor(248);
    doc.roundedRect(x, cursorY, cardW, cardH, 4, 4, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(label, x + 8, cursorY + 16);
    doc.setFontSize(13);
    doc.setTextColor(20);
    doc.text(value, x + 8, cursorY + 36);
  });
  cursorY += cardH + 18;

  // Tabela de despesas
  const head = [['Data', 'Descrição', 'Tipo', 'CC', 'Forma pagto', 'Valor']];
  const body = report.expenses.map((e) => [
    formatDateBR(e.date),
    e.description,
    e.category || '-',
    e.costCenter || '-',
    paymentLabel(e.paymentMethod),
    formatCurrency(e.amountCents, e.currency || 'BRL'),
  ]);

  autoTable(doc, {
    startY: cursorY,
    head,
    body,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] },
    columnStyles: {
      5: { halign: 'right' },
    },
    alternateRowStyles: { fillColor: [248, 248, 248] },
  });

  // jsPDF-autotable updates lastAutoTable on the doc instance.
  const docWithTable = doc as unknown as { lastAutoTable?: { finalY: number } };
  cursorY = (docWithTable.lastAutoTable?.finalY ?? cursorY) + 24;

  // Sumário por categoria
  const buckets = aggregateByCategory(report);
  if (buckets.length > 0 && report.totalCents > 0) {
    if (cursorY > 700) {
      doc.addPage();
      cursorY = margin;
    }
    doc.setFontSize(12);
    doc.setTextColor(20);
    doc.text('Sumário por categoria', margin, cursorY);
    cursorY += 8;

    const catBody = buckets.map((b) => {
      const pct = ((b.totalCents / report.totalCents) * 100).toFixed(1) + '%';
      return [b.name, String(b.count), pct, formatCurrency(b.totalCents)];
    });

    autoTable(doc, {
      startY: cursorY + 4,
      head: [['Categoria', '#', '%', 'Total']],
      body: catBody,
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255] },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
      },
    });
  }

  // Footer com data de geração
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(150);
    const generatedAt = new Date().toLocaleString('pt-BR');
    doc.text(
      `Gerado em ${generatedAt} • OxyVE`,
      margin,
      doc.internal.pageSize.getHeight() - 16
    );
    doc.text(
      `Página ${p} / ${totalPages}`,
      pageWidth - margin,
      doc.internal.pageSize.getHeight() - 16,
      { align: 'right' }
    );
  }

  return doc.output('blob');
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

export function downloadReportPdf(report: ExtendedReport): void {
  const blob = generateReportPdf(report);
  triggerDownload(blob, `${sanitizeFilename(report.title)}.pdf`);
}
