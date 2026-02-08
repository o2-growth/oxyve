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

export const formatDate = (date: string | Date): string => {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(date));
};
