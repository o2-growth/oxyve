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

// Número digitado em pt-BR → number. Vírgula é decimal; ponto é milhar quando forma grupos
// de 3 dígitos ("1.500", "1.234.567") e decimal nos demais casos ("61.40", "12.5").
// Devolve NaN para o que não for número (inclusive negativo).
export const parseDecimalBR = (input: string): number => {
  let s = (input || '').replace(/[R$\s]/g, '');
  if (!/^\d[\d.,]*$/.test(s)) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  // "1.500" é mil e quinhentos: antes virava R$ 1,50 e o reembolso saía mil vezes menor.
  else if (/^\d{1,3}(\.\d{3})+$/.test(s) || (s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

// Valor digitado em pt-BR → centavos. Aceita "61,40", "1.234,56", "1.500", "R$ 61,40" e
// "61.40". Antes era parseFloat(s.replace(',', '.')), que lia "1.234,56" como R$ 1,23.
export const parseAmountToCents = (input: string): number => {
  const n = parseDecimalBR(input);
  return Number.isNaN(n) ? NaN : Math.round(n * 100);
};

/**
 * Limite opcional digitado em R$ (teto diário de categoria/tipo). Vazio = sem
 * limite (null); texto inválido ou negativo = 'invalid'. Mesma leitura pt-BR do
 * valor da despesa: "1.500" é mil e quinhentos, não R$ 1,50.
 */
export const parseOptionalLimitCents = (input: string | null | undefined): number | null | 'invalid' => {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  const cents = parseAmountToCents(raw);
  return Number.isNaN(cents) ? 'invalid' : cents;
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

/** Normaliza o que foi digitado no campo Valor para "1.234,56" ao sair do campo. */
export const formatAmountInput = (input: string): string => {
  const cents = parseAmountToCents(input);
  if (Number.isNaN(cents)) return input;
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * Valor lançado de alimentação: menor entre a nota e dias × teto diário. É o que
 * o campo Valor mostra; o banco (tg_expenses_regras) ainda desconta o que o dia/mês
 * já usou e nunca reembolsa acima do teto.
 */
export const foodCapCents = (noteCents: number, dailyLimitCents: number, days = 1): number =>
  Math.min(noteCents, Math.max(1, days || 1) * dailyLimitCents);

/** Texto do teto: "R$ 30,00/dia" ou "R$ 30,00/dia × 3 dias". */
export const foodCapLabel = (dailyLimitCents: number, days = 1): string =>
  `${formatCurrency(dailyLimitCents)}/dia${days > 1 ? ` × ${days} dias` : ''}`;

export const formatDate = (date: string | Date): string => {
  return new Intl.DateTimeFormat('pt-BR').format(parseDateOnly(date));
};
