// Montagem da conta a pagar (POST /v1/financeiro/contas-a-pagar) a partir de um
// relatório aprovado. Módulo puro (sem Deno) para o Vitest.
//
// Dinheiro em centavos inteiros até o fim: os grupos do rateio somam centavos,
// então a soma do rateio bate exatamente com o valor. Só na saída vira reais.

import { calcularVencimento } from "./vencimento.ts";

export const APP_URL_PADRAO = "https://oxyve.vercel.app";
export const METODO_PIX = "PIX_PAGAMENTO_INSTANTANEO";
export const SETOR_GERAL = "Geral";

export interface DespesaInput {
  id: string;
  description?: string | null;
  status: string;
  is_reimbursable: boolean;
  reimbursable_cents: number | null;
  category_id: string | null;
  category_name?: string | null;
  kind?: string | null;
  sector?: string | null;
}

export interface CategoriaMap {
  expense_category_id: string | null;
  kind: string | null;
  ca_categoria_id: string;
}

export interface SetorMap {
  sector: string;
  ca_centro_custo_id: string;
}

export interface MontarInput {
  report: { id: string; title: string; end_date: string | null };
  /** Data da aprovação em São Paulo (YYYY-MM-DD). */
  dataAprovacao: string;
  nomeFuncionario: string;
  pessoaId: string;
  contaFinanceiraId: string | null;
  diaVencimento: number;
  expenses: DespesaInput[];
  categoryMap: CategoriaMap[];
  sectorMap: SetorMap[];
  appUrl?: string;
}

export interface RateioCentroCusto {
  id_centro_custo: string;
  valor: number;
}

export interface Rateio {
  id_categoria: string;
  valor: number;
  rateio_centro_custo?: RateioCentroCusto[];
}

export interface ContaAPagarPayload {
  descricao: string;
  data_competencia: string;
  valor: number;
  id_fornecedor: string;
  conta_financeira: string;
  referencia_externa: string;
  observacao: string;
  rateio: Rateio[];
  condicao_pagamento: {
    parcelas: {
      descricao: string;
      data_vencimento: string;
      conta_financeira: string;
      detalhe_valor: { valor_bruto: number };
      metodo_pagamento: string;
    }[];
  };
}

export type MontarResultado =
  | {
      ok: true;
      payload: ContaAPagarPayload;
      valorCents: number;
      vencimento: string;
      itens: number;
      /** Soma por categoria e centro de custo, em centavos (para conferência). */
      rateioCents: { id_categoria: string; cents: number; centros: { id: string; cents: number }[] }[];
    }
  | { ok: false; erro: string };

/** Centavos inteiros → reais com 2 casas, sem resíduo de ponto flutuante. */
export function centavosParaReais(cents: number): number {
  return Math.round(cents) / 100;
}

/** Reais (número da API) → centavos inteiros. */
export function reaisParaCentavos(reais: number | null | undefined): number {
  return typeof reais === "number" && Number.isFinite(reais) ? Math.round(reais * 100) : 0;
}

export function referenciaExterna(reportId: string): string {
  return `oxyve-report-${reportId}`;
}

export function descricaoConta(nome: string, titulo: string): string {
  const n = (nome || "").trim() || "colaborador";
  return `Reembolso ${n} — ${(titulo || "").trim()}`.slice(0, 250);
}

/** Despesa que entra no pagamento: aprovada (ou já paga), reembolsável e com valor. */
export function entraNoReembolso(e: DespesaInput): boolean {
  return (
    e.is_reimbursable === true &&
    (e.status === "approved" || e.status === "paid") &&
    typeof e.reimbursable_cents === "number" &&
    e.reimbursable_cents > 0
  );
}

function nomeCategoria(e: DespesaInput): string {
  return (e.category_name || "").trim() || "Sem categoria";
}

export function montarContaAPagar(input: MontarInput): MontarResultado {
  if (!input.contaFinanceiraId) {
    return { ok: false, erro: "Conta financeira do Conta Azul não configurada." };
  }

  const despesas = input.expenses.filter(entraNoReembolso);
  if (despesas.length === 0) {
    return { ok: false, erro: "Relatório sem valor reembolsável aprovado." };
  }

  const porCategoria = new Map<string, string>();
  const porKind = new Map<string, string>();
  for (const m of input.categoryMap) {
    if (!m.ca_categoria_id) continue;
    if (m.expense_category_id) porCategoria.set(m.expense_category_id, m.ca_categoria_id);
    else if (m.kind) porKind.set(m.kind, m.ca_categoria_id);
  }
  const porSetor = new Map<string, string>();
  for (const s of input.sectorMap) {
    if (s.sector && s.ca_centro_custo_id) porSetor.set(s.sector, s.ca_centro_custo_id);
  }

  // Categoria própria primeiro; sem ela, o tipo (food/transport/other). Despesa
  // sem categoria nenhuma cai no tipo "other".
  const semDePara = new Set<string>();
  const linhas = despesas.map((e) => {
    const ca =
      (e.category_id ? porCategoria.get(e.category_id) : undefined) ??
      porKind.get(e.kind || "other");
    if (!ca) semDePara.add(nomeCategoria(e));
    const setor = (e.sector || "").trim() || SETOR_GERAL;
    return { e, ca, centro: porSetor.get(setor) ?? null };
  });
  if (semDePara.size > 0) {
    const nomes = [...semDePara].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return {
      ok: false,
      erro:
        nomes.length === 1
          ? `Categoria ${nomes[0]} sem correspondente no Conta Azul.`
          : `Categorias ${nomes.join(", ")} sem correspondente no Conta Azul.`,
    };
  }

  // Agrupa em centavos, na ordem em que as categorias aparecem no relatório.
  const grupos = new Map<string, { cents: number; centros: Map<string, number>; semCentro: number }>();
  for (const { e, ca, centro } of linhas) {
    const g = grupos.get(ca as string) ?? { cents: 0, centros: new Map(), semCentro: 0 };
    const c = e.reimbursable_cents as number;
    g.cents += c;
    if (centro) g.centros.set(centro, (g.centros.get(centro) ?? 0) + c);
    else g.semCentro += c;
    grupos.set(ca as string, g);
  }

  let semCentroParcial = false;
  const rateio: Rateio[] = [];
  const rateioCents: { id_categoria: string; cents: number; centros: { id: string; cents: number }[] }[] = [];
  for (const [idCategoria, g] of grupos) {
    const item: Rateio = { id_categoria: idCategoria, valor: centavosParaReais(g.cents) };
    // Centro de custo só quando cobre a categoria inteira: rateio parcial não
    // fecha com o valor da categoria. Setor sem de-para = sem centro de custo.
    let centros: { id: string; cents: number }[] = [];
    if (g.centros.size > 0 && g.semCentro === 0) {
      centros = [...g.centros].map(([id, cents]) => ({ id, cents }));
      item.rateio_centro_custo = centros.map((c) => ({ id_centro_custo: c.id, valor: centavosParaReais(c.cents) }));
    } else if (g.centros.size > 0) {
      semCentroParcial = true;
    }
    rateio.push(item);
    rateioCents.push({ id_categoria: idCategoria, cents: g.cents, centros });
  }

  const valorCents = despesas.reduce((s, e) => s + (e.reimbursable_cents as number), 0);
  const valor = centavosParaReais(valorCents);
  const vencimento = calcularVencimento(input.dataAprovacao, input.diaVencimento);
  const descricao = descricaoConta(input.nomeFuncionario, input.report.title);
  const appUrl = (input.appUrl || APP_URL_PADRAO).replace(/\/+$/, "");
  const itens = despesas.length;

  const obs = [
    `Reembolso de despesas lançado pelo Oxy VE.`,
    `Relatório: ${appUrl}/app/reports/${input.report.id}`,
    `${itens} ${itens === 1 ? "item" : "itens"} reembolsáve${itens === 1 ? "l" : "is"}.`,
  ];
  if (semCentroParcial) {
    obs.push("Centro de custo omitido em categoria com setor sem correspondente.");
  }

  const payload: ContaAPagarPayload = {
    descricao,
    data_competencia: input.report.end_date || input.dataAprovacao,
    valor,
    id_fornecedor: input.pessoaId,
    conta_financeira: input.contaFinanceiraId,
    referencia_externa: referenciaExterna(input.report.id),
    observacao: obs.join("\n"),
    rateio,
    condicao_pagamento: {
      parcelas: [
        {
          descricao,
          data_vencimento: vencimento,
          conta_financeira: input.contaFinanceiraId,
          detalhe_valor: { valor_bruto: valor },
          metodo_pagamento: METODO_PIX,
        },
      ],
    },
  };

  return { ok: true, payload, valorCents, vencimento, itens, rateioCents };
}

/** CPF só com dígitos (11) ou null. CNPJ não serve: o funcionário é pessoa física. */
export function cpfDoPerfil(cpfCnpj: string | null | undefined): string | null {
  const d = (cpfCnpj || "").replace(/\D/g, "");
  return d.length === 11 ? d : null;
}

export function formatarCpf(d: string): string {
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

/** Corpo do POST /v1/pessoas para o funcionário (pessoa física, fornecedor). */
export function montarPessoa(nome: string, cpf: string, email?: string | null) {
  const body: {
    nome: string;
    tipo_pessoa: "Física";
    cpf: string;
    ativo: boolean;
    perfis: { tipo_perfil: "Fornecedor" }[];
    email?: string;
  } = {
    nome: (nome || "").trim() || formatarCpf(cpf),
    tipo_pessoa: "Física",
    cpf: formatarCpf(cpf),
    ativo: true,
    perfis: [{ tipo_perfil: "Fornecedor" }],
  };
  if (email) body.email = email;
  return body;
}
