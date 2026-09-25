export const EXPENSE_STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  submitted: 'Enviada',
  approved: 'Aprovada',
  rejected: 'Reprovada',
  paid: 'Paga',
};

export const REPORT_STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  submitted: 'Enviado',
  approved: 'Aprovado',
  rejected: 'Reprovado',
  paid: 'Pago',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  personal_card: 'Cartão Pessoal',
  corporate_card: 'Cartão Corporativo',
  cash: 'Dinheiro',
  other: 'Outro',
};

export const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: 'R$',
  USD: '$',
  EUR: '€',
};

export const formatCurrency = (amountCents: number, currency = 'BRL'): string => {
  const amount = amountCents / 100;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(amount);
};

// `new Date('2026-09-20')` é meia-noite em UTC — em Brasília vira 19/09 às 21h. Toda
// coluna `date` (sem hora) do banco passa por aqui para virar meia-noite LOCAL; sem isso
// a lista mostrava o dia anterior e o form de edição regravava a data com -1 dia.
export const parseDateOnly = (date: string | Date): Date => {
  if (date instanceof Date) return date;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(date);
};

// Valor digitado em pt-BR → centavos. Aceita "61,40", "1.234,56", "R$ 61,40" e "61.40";
// devolve NaN para o que não for número. Antes era parseFloat(s.replace(',', '.')), que
// lia "1.234,56" como R$ 1,23.
export const parseAmountToCents = (input: string): number => {
  let s = (input || '').replace(/[R$\s]/g, '');
  if (!/^\d[\d.,]*$/.test(s)) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

// Teto de sanidade: R$ 1 milhão por lançamento.
export const MAX_EXPENSE_CENTS = 100_000_000;

export const amountFieldError = (input: string): string | null => {
  const cents = parseAmountToCents(input);
  if (Number.isNaN(cents)) return 'Digite um valor como 61,40';
  if (cents <= 0) return 'O valor precisa ser maior que zero';
  if (cents > MAX_EXPENSE_CENTS) return 'Valor acima de R$ 1.000.000 — confira os dígitos';
  return null;
};

// Janela de lançamento (regra do banco: tg_expenses_regras). Datas em meia-noite local.
export const MAX_EXPENSE_AGE_DAYS = 20;
export const endOfToday = (): Date => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};
export const minExpenseDate = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - MAX_EXPENSE_AGE_DAYS);
  return d;
};

export const formatDate = (date: string | Date): string => {
  return new Intl.DateTimeFormat('pt-BR').format(parseDateOnly(date));
};
