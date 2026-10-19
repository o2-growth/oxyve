// Normalização e validação do que o modelo devolve. Módulo puro (sem Deno) para
// poder ser testado no Vitest do app: o modelo erra formato, inventa data futura
// e lê CNPJ com dígito trocado — nada disso pode chegar cru ao formulário.

export type Confidence = "high" | "medium" | "low";

export const RECEIPT_TYPES = [
  "nota_fiscal",
  "recibo",
  "comprovante_pix",
  "comprovante_cartao",
  "outro",
] as const;
export type ReceiptType = (typeof RECEIPT_TYPES)[number];

export const RECEIPT_ISSUES = [
  "blurry",
  "cropped",
  "multiple_totals",
  "handwritten",
  "not_a_receipt",
  "low_light",
  "other",
] as const;
export type ReceiptIssue = (typeof RECEIPT_ISSUES)[number];

export const EXPENSE_KIND_HINTS = ["food", "transport", "other"] as const;
export type ExpenseKindHint = (typeof EXPENSE_KIND_HINTS)[number];

export interface NormalizedReceipt {
  extracted_date: string | null;
  extracted_amount_cents: number | null;
  extracted_cnpj: string | null;
  extracted_supplier: string | null;
  receipt_type: ReceiptType | null;
  confidence: Confidence;
  amount_confidence: Confidence;
  date_confidence: Confidence;
  issues: ReceiptIssue[];
  expense_kind_hint: ExpenseKindHint | null;
}

// R$ 1.000.000,00 em centavos: acima disso é leitura errada (vírgula/ponto trocados).
export const MAX_AMOUNT_CENTS = 100_000_000;
export const MIN_RECEIPT_DATE = "2000-01-01";
export const MAX_SUPPLIER_CHARS = 80;
const TIME_ZONE = "America/Sao_Paulo";

const CONFIDENCE_ORDER: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

function asConfidence(v: unknown): Confidence | null {
  return v === "high" || v === "medium" || v === "low" ? v : null;
}

function worst(...values: Confidence[]): Confidence {
  return values.reduce((a, b) => (CONFIDENCE_ORDER[b] < CONFIDENCE_ORDER[a] ? b : a), "high");
}

/** Data de hoje (YYYY-MM-DD) no fuso de Brasília — o servidor roda em UTC. */
export function todayInSaoPaulo(now: Date = new Date()): string {
  // en-CA formata como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Valor em centavos: inteiro, > 0 e abaixo do teto; senão null. */
export function normalizeAmountCents(v: unknown): number | null {
  let n: number | null = null;
  if (typeof v === "number") n = v;
  else if (typeof v === "string" && /^\d+$/.test(v.trim())) n = Number(v.trim());
  if (n === null || !Number.isInteger(n) || n <= 0 || n >= MAX_AMOUNT_CENTS) return null;
  return n;
}

function isRealDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Data ISO válida, de 2000 até hoje (Brasília). Aceita também dd/mm/aaaa e
 * dd/mm/aa caso o modelo devolva no formato da nota (ano de 2 dígitos = 20xx).
 */
export function normalizeDate(v: unknown, now: Date = new Date()): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
    if (!match) return null;
    d = Number(match[1]);
    m = Number(match[2]);
    y = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  }
  if (!isRealDate(y, m, d)) return null;
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (iso < MIN_RECEIPT_DATE || iso > todayInSaoPaulo(now)) return null;
  return iso;
}

/** CNPJ com 14 dígitos e dígitos verificadores corretos. */
export function isValidCnpj(digits: string): boolean {
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13]);
}

/** CNPJ só dígitos; dígito trocado na leitura vira null (não inventa CNPJ). */
export function normalizeCnpj(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const digits = v.replace(/\D/g, "");
  return isValidCnpj(digits) ? digits : null;
}

export function normalizeSupplier(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim().slice(0, MAX_SUPPLIER_CHARS).trim();
  return s || null;
}

function normalizeIssues(v: unknown): ReceiptIssue[] {
  if (!Array.isArray(v)) return [];
  const valid = v.filter((i): i is ReceiptIssue => (RECEIPT_ISSUES as readonly unknown[]).includes(i));
  return [...new Set(valid)];
}

/**
 * Normaliza a saída da função extract_receipt_data. Campo inválido vira null e,
 * no caso de valor e data, derruba a confiança do campo para low — o front usa
 * isso para pedir conferência em vez de salvar direto.
 */
export function normalizeExtraction(raw: unknown, now: Date = new Date()): NormalizedReceipt {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const issues = normalizeIssues(r.issues);
  const general = asConfidence(r.confidence);

  // Resposta sem os campos novos (ou modelo que os omitiu): herda a confiança geral.
  let amountConfidence = asConfidence(r.amount_confidence) ?? general ?? "low";
  let dateConfidence = asConfidence(r.date_confidence) ?? general ?? "low";

  const amount = normalizeAmountCents(r.extracted_amount_cents);
  if (amount === null) amountConfidence = "low";
  const date = normalizeDate(r.extracted_date, now);
  if (date === null) dateConfidence = "low";

  const receiptType = (RECEIPT_TYPES as readonly unknown[]).includes(r.receipt_type)
    ? (r.receipt_type as ReceiptType)
    : null;
  const kindHint = (EXPENSE_KIND_HINTS as readonly unknown[]).includes(r.expense_kind_hint)
    ? (r.expense_kind_hint as ExpenseKindHint)
    : null;

  // Foto que não é comprovante: nada é preenchido nem bloqueia por política.
  if (issues.includes("not_a_receipt")) {
    return {
      extracted_date: null,
      extracted_amount_cents: null,
      extracted_cnpj: null,
      extracted_supplier: null,
      receipt_type: null,
      confidence: "low",
      amount_confidence: "low",
      date_confidence: "low",
      issues,
      expense_kind_hint: null,
    };
  }

  return {
    extracted_date: date,
    extracted_amount_cents: amount,
    extracted_cnpj: normalizeCnpj(r.extracted_cnpj),
    extracted_supplier: normalizeSupplier(r.extracted_supplier),
    receipt_type: receiptType,
    // A confiança geral é a do modelo (receiptPolicyBlocks depende dela); sem
    // ela, deriva do pior entre valor e data.
    confidence: general ?? worst(amountConfidence, dateConfidence),
    amount_confidence: amountConfidence,
    date_confidence: dateConfidence,
    issues,
    expense_kind_hint: kindHint,
  };
}

/**
 * Leitura do modelo barato que merece uma segunda passada no modelo maior:
 * valor ou data com confiança baixa, valor ausente, foto tremida ou nota com
 * mais de um total (o erro mais comum: pegar subtotal ou "valor recebido").
 */
export function needsEscalation(r: NormalizedReceipt): boolean {
  return (
    r.amount_confidence === "low" ||
    r.date_confidence === "low" ||
    r.extracted_amount_cents === null ||
    r.issues.includes("multiple_totals") ||
    r.issues.includes("blurry")
  );
}
