// Leitura defensiva das respostas do Conta Azul (specs OpenAPI oficiais).
// Módulo puro. Campo ausente vira null em vez de quebrar o sync.

import { reaisParaCentavos } from "./payload.ts";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** 201 do POST contas-a-pagar: id do evento e da (única) parcela. */
export function parseContaCriada(body: unknown): { contaId: string | null; parcelaId: string | null } {
  const b = obj(body);
  const parcelas = obj(b.condicao_pagamento).parcelas;
  const p = Array.isArray(parcelas) ? obj(parcelas[0]) : {};
  return { contaId: str(b.id) ?? str(obj(p.evento).id), parcelaId: str(p.id) };
}

/** Status da parcela no GET /v1/financeiro/parcelas/{id} (StatusDetalhadoDaParcela). */
export type StatusParcela =
  | "PENDENTE"
  | "QUITADO"
  | "CANCELADO"
  | "RENEGOCIADO"
  | "RECEBIDO_PARCIAL"
  | "ATRASADO"
  | "PERDIDO";

export interface ParcelaLida {
  id: string | null;
  status: string | null;
  eventoId: string | null;
  naoPagoCents: number;
  totalCents: number;
  pagoCents: number;
}

export function parseParcela(body: unknown): ParcelaLida {
  const b = obj(body);
  const comp = obj(b.valor_composicao);
  const total = num(b.valor_total_liquido) ?? num(comp.valor_liquido) ?? num(comp.valor_bruto);
  return {
    id: str(b.id),
    status: str(b.status),
    eventoId: str(obj(b.evento).id),
    naoPagoCents: reaisParaCentavos(num(b.nao_pago)),
    totalCents: reaisParaCentavos(total),
    pagoCents: reaisParaCentavos(num(b.valor_pago)),
  };
}

/** Quitada no Conta Azul (o GET por id usa QUITADO; a busca, RECEBIDO/ACQUITTED). */
export function parcelaQuitada(status: string | null): boolean {
  return status === "QUITADO" || status === "RECEBIDO" || status === "ACQUITTED";
}

export function parcelaEncerradaSemPagamento(status: string | null): boolean {
  return status === "CANCELADO" || status === "PERDIDO" || status === "RENEGOCIADO";
}

/** Item do GET /v1/financeiro/contas-a-pagar: o id é o da parcela. */
export interface ContaListada {
  parcelaId: string;
  descricao: string;
  totalCents: number;
  dataVencimento: string | null;
  status: string | null;
}

export function parseListaContas(body: unknown): ContaListada[] {
  const itens = obj(body).itens;
  if (!Array.isArray(itens)) return [];
  const out: ContaListada[] = [];
  for (const raw of itens) {
    const i = obj(raw);
    const id = str(i.id);
    if (!id) continue;
    out.push({
      parcelaId: id,
      descricao: (str(i.descricao) ?? "").trim(),
      totalCents: reaisParaCentavos(num(i.total)),
      dataVencimento: str(i.data_vencimento),
      status: str(i.status),
    });
  }
  return out;
}

/** Pessoas: GET /v1/pessoas devolve "items" (não "itens"). */
export interface PessoaListada {
  id: string;
  documento: string;
  ativo: boolean;
  perfis: string[];
}

export function parseListaPessoas(body: unknown): PessoaListada[] {
  const b = obj(body);
  const items = Array.isArray(b.items) ? b.items : Array.isArray(b.itens) ? b.itens : [];
  const out: PessoaListada[] = [];
  for (const raw of items) {
    const p = obj(raw);
    const id = str(p.id);
    if (!id) continue;
    const perfis = Array.isArray(p.perfis)
      ? p.perfis.map((x) => (typeof x === "string" ? x : str(obj(x).tipo_perfil) ?? "")).filter(Boolean)
      : [];
    out.push({
      id,
      documento: (str(p.documento) ?? "").replace(/\D/g, ""),
      ativo: p.ativo !== false,
      perfis,
    });
  }
  return out;
}

export function parsePessoaCriada(body: unknown): string | null {
  return str(obj(body).id);
}

export function parseContaConectada(body: unknown): { idEmpresa: string | null; nome: string | null } {
  const b = obj(body);
  return { idEmpresa: str(b.id_empresa), nome: str(b.razao_social) ?? str(b.nome_fantasia) };
}

/** Opção de select da tela (categoria, centro de custo, conta financeira). */
export interface Opcao {
  id: string;
  nome: string;
  extra?: string | null;
}

export function parseCategorias(itens: unknown[]): Opcao[] {
  const todas = itens.map(obj);
  const nomes = new Map(todas.map((c) => [str(c.id), str(c.nome)]));
  return todas
    .filter((c) => str(c.id) && (c.tipo === undefined || c.tipo === "DESPESA"))
    .map((c) => {
      const pai = str(c.categoria_pai);
      return { id: str(c.id) as string, nome: str(c.nome) ?? "(sem nome)", extra: pai ? nomes.get(pai) ?? null : null };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function parseCentrosCusto(itens: unknown[]): Opcao[] {
  return itens
    .map(obj)
    .filter((c) => str(c.id) && c.ativo !== false)
    .map((c) => ({ id: str(c.id) as string, nome: str(c.nome) ?? "(sem nome)", extra: str(c.codigo) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function parseContasFinanceiras(itens: unknown[]): Opcao[] {
  return itens
    .map(obj)
    .filter((c) => str(c.id) && c.ativo !== false)
    .map((c) => ({ id: str(c.id) as string, nome: str(c.nome) ?? "(sem nome)", extra: str(c.tipo) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Página de listagem (itens + itens_totais) do financeiro. */
export function parsePagina(body: unknown, chave = "itens"): { itens: unknown[]; total: number | null } {
  const b = obj(body);
  const itens = Array.isArray(b[chave]) ? (b[chave] as unknown[]) : [];
  return { itens, total: num(b.itens_totais) ?? num(b.totalItems) };
}
