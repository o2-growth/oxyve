// Regras do sync Oxy VE ↔ Conta Azul, sem Supabase nem Deno: o banco entra por
// SyncStore e o HTTP por ContaAzulApi, os dois trocáveis no teste.
//
// (a) envia relatórios pendentes (1 conta a pagar por relatório);
// (b) lança a baixa dos relatórios pagos no Oxy VE;
// (c) confere quitação lá e marca pago aqui.
//
// Idempotência: o banco marca 'enviando' antes de criar; da 2ª tentativa em
// diante, procura a conta no Conta Azul antes de criar outra.

import type { ContaAzulApi } from "./api.ts";
import { ContaAzulError, ErroDefinitivo, mensagemDeErro } from "./errors.ts";
import {
  parcelaEncerradaSemPagamento,
  parcelaQuitada,
  parseContaCriada,
  parseListaContas,
  parseListaPessoas,
  parseParcela,
  parsePessoaCriada,
} from "./parse.ts";
import {
  centavosParaReais,
  cpfDoPerfil,
  METODO_PIX,
  montarContaAPagar,
  montarPessoa,
  type CategoriaMap,
  type DespesaInput,
  type SetorMap,
} from "./payload.ts";
import { dataSaoPaulo, somarDias } from "./vencimento.ts";

/** Tentativas automáticas para erro transitório antes de virar 'erro'. */
export const MAX_TENTATIVAS = 5;
export const POLLING_MIN = 15;

export interface ReportData {
  report: {
    id: string;
    org_id: string;
    user_id: string;
    title: string;
    status: string;
    end_date: string | null;
    approved_at: string | null;
    ca_status: string | null;
    ca_attempts: number;
    ca_vencimento: string | null;
    ca_conta_id: string | null;
    ca_parcela_id: string | null;
  };
  employee: {
    id: string;
    full_name: string | null;
    email: string | null;
    cpf_cnpj: string | null;
    ca_pessoa_id: string | null;
  } | null;
  expenses: DespesaInput[];
  category_map: CategoriaMap[];
  sector_map: SetorMap[];
  config: { conta_financeira_id: string | null; dia_vencimento: number } | null;
}

export interface ReportParaPagamento {
  id: string;
  ca_parcela_id: string;
}

export interface SyncStore {
  reservarPendentes(orgId: string, limite: number): Promise<string[]>;
  dadosRelatorio(reportId: string): Promise<ReportData | null>;
  salvarPessoa(userId: string, pessoaId: string): Promise<void>;
  /** Grava o vencimento calculado antes de criar (o retry procura por ele). */
  salvarVencimento(reportId: string, vencimento: string): Promise<void>;
  marcarEnviado(reportId: string, r: { contaId: string | null; parcelaId: string; vencimento: string | null }): Promise<void>;
  /** final=false devolve para a fila ('pendente'); final=true para 'erro'. */
  marcarErroEnvio(reportId: string, mensagem: string, final: boolean): Promise<void>;
  /** POST sem resposta: fica 'enviando' (o claim reabre em 10 min e confere antes). */
  marcarIncerto(reportId: string, mensagem: string): Promise<void>;
  listarParaBaixa(orgId: string, limite: number): Promise<ReportParaPagamento[]>;
  /** RPC contaazul_claim_baixa: só uma execução lança a baixa (false = outra já está nela). */
  reservarBaixa(reportId: string): Promise<boolean>;
  listarParaPolling(orgId: string, limite: number): Promise<ReportParaPagamento[]>;
  marcarPagoSync(reportId: string): Promise<void>;
  /** ca_error no relatório já enviado; final=true tira de 'enviado' para 'erro'. */
  marcarErroPagamento(reportId: string, mensagem: string, final: boolean): Promise<void>;
  marcarConferido(reportId: string, aviso: string | null): Promise<void>;
  /** RPC contaazul_marcar_pago: false se o relatório não estava mais aprovado. */
  marcarPagoNoOxy(reportId: string): Promise<boolean>;
}

export interface SyncCtx {
  api: ContaAzulApi;
  store: SyncStore;
  appUrl?: string;
  agora?: () => Date;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export type ResultadoEnvio = "enviado" | "recuperado" | "erro" | "pendente" | "incerto" | "ignorado";

const hoje = (ctx: SyncCtx) => dataSaoPaulo((ctx.agora ?? (() => new Date()))());


/** Pessoa do funcionário no Conta Azul: a salva, a achada pelo CPF ou uma nova. */
export async function garantirPessoa(ctx: SyncCtx, emp: NonNullable<ReportData["employee"]>): Promise<string> {
  if (emp.ca_pessoa_id) return emp.ca_pessoa_id;
  const cpf = cpfDoPerfil(emp.cpf_cnpj);
  if (!cpf) throw new ErroDefinitivo("Funcionário sem CPF no perfil.");

  const comCpf = (body: unknown) => parseListaPessoas(body).filter((p) => p.documento === cpf);
  const fornecedor = comCpf(await ctx.api.buscarPessoas(cpf, "Fornecedor")).sort((a, b) => Number(b.ativo) - Number(a.ativo));
  if (fornecedor[0]) {
    await ctx.store.salvarPessoa(emp.id, fornecedor[0].id);
    return fornecedor[0].id;
  }
  // Mesmo CPF como cliente: não mexe no cadastro de lá (trocar perfis pode
  // apagar o de cliente); pede para o admin marcar Fornecedor.
  if (comCpf(await ctx.api.buscarPessoas(cpf, "Cliente")).length > 0) {
    throw new ErroDefinitivo(
      `O CPF de ${emp.full_name || "o funcionário"} já está no Conta Azul sem o perfil Fornecedor. Marque "Fornecedor" no cadastro dessa pessoa lá e reenvie.`,
    );
  }
  const id = parsePessoaCriada(await ctx.api.criarPessoa(montarPessoa(emp.full_name ?? "", cpf, emp.email)));
  if (!id) throw new ErroDefinitivo("Conta Azul não devolveu o id do funcionário cadastrado.");
  await ctx.store.salvarPessoa(emp.id, id);
  return id;
}

/**
 * Procura a conta criada numa tentativa anterior (timeout/queda). Primeiro pelo
 * filtro "referencias" da spec; como ela não diz se é a referencia_externa,
 * confere sempre descrição e valor exatos, e cai para descrição+valor+vencimento.
 */
export async function procurarContaExistente(
  ctx: SyncCtx,
  alvo: { referencia: string; descricao: string; valorCents: number; vencimento: string },
): Promise<string | null> {
  const janela = { data_vencimento_de: somarDias(alvo.vencimento, -60), data_vencimento_ate: somarDias(alvo.vencimento, 60) };
  const confere = (body: unknown) =>
    parseListaContas(body).find((c) => c.descricao === alvo.descricao.trim() && c.totalCents === alvo.valorCents) ?? null;

  const porRef = confere(await ctx.api.buscarContasAPagar({ ...janela, referencias: [alvo.referencia] }));
  if (porRef) return porRef.parcelaId;
  const valor = centavosParaReais(alvo.valorCents).toFixed(2);
  const porDescricao = confere(
    await ctx.api.buscarContasAPagar({ ...janela, descricao: alvo.descricao, valor_de: valor, valor_ate: valor }),
  );
  return porDescricao?.parcelaId ?? null;
}

/** Envia um relatório já reservado ('enviando'). */
export async function enviarRelatorio(ctx: SyncCtx, reportId: string): Promise<ResultadoEnvio> {
  const dados = await ctx.store.dadosRelatorio(reportId);
  if (!dados) return "ignorado";
  const r = dados.report;
  const tentativa = r.ca_attempts;

  try {
    if (r.ca_parcela_id) {
      // Já criada (estado reaberto à mão): só volta para 'enviado'.
      await ctx.store.marcarEnviado(r.id, { contaId: r.ca_conta_id, parcelaId: r.ca_parcela_id, vencimento: r.ca_vencimento });
      return "enviado";
    }
    if (!dados.employee) throw new ErroDefinitivo("Funcionário do relatório não encontrado.");

    const dataAprovacao = r.approved_at ? dataSaoPaulo(r.approved_at) : hoje(ctx);
    const dia = dados.config?.dia_vencimento ?? 25;
    // Vencimento fixado na 1ª tentativa: mudar o dia na config não muda conta já tentada.
    const vencimentoFixo = r.ca_vencimento;
    const base = {
      report: { id: r.id, title: r.title, end_date: r.end_date },
      dataAprovacao,
      nomeFuncionario: dados.employee.full_name ?? "",
      contaFinanceiraId: dados.config?.conta_financeira_id ?? null,
      diaVencimento: dia,
      expenses: dados.expenses,
      categoryMap: dados.category_map,
      sectorMap: dados.sector_map,
      appUrl: ctx.appUrl,
    };

    // Valida de-para e valores antes de cadastrar a pessoa no Conta Azul.
    const previa = montarContaAPagar({ ...base, pessoaId: "-" });
    if (!previa.ok) throw new ErroDefinitivo(previa.erro);

    const pessoaId = await garantirPessoa(ctx, dados.employee);
    const montado = montarContaAPagar({ ...base, pessoaId });
    if (!montado.ok) throw new ErroDefinitivo(montado.erro);
    if (vencimentoFixo && vencimentoFixo !== montado.vencimento) {
      montado.vencimento = vencimentoFixo;
      montado.payload.condicao_pagamento.parcelas[0].data_vencimento = vencimentoFixo;
    }
    if (!vencimentoFixo) await ctx.store.salvarVencimento(r.id, montado.vencimento);

    if (tentativa > 1) {
      const existente = await procurarContaExistente(ctx, {
        referencia: montado.payload.referencia_externa,
        descricao: montado.payload.descricao,
        valorCents: montado.valorCents,
        vencimento: montado.vencimento,
      });
      if (existente) {
        const parcela = parseParcela(await ctx.api.obterParcela(existente));
        await ctx.store.marcarEnviado(r.id, { contaId: parcela.eventoId, parcelaId: existente, vencimento: montado.vencimento });
        ctx.log?.("contaazul: conta já existia, recuperada", { report: r.id });
        return "recuperado";
      }
    }

    const criada = parseContaCriada(await ctx.api.criarContaAPagar(montado.payload));
    if (!criada.parcelaId) {
      // Criou mas sem parcela na resposta: não repete o POST, confere na próxima.
      await ctx.store.marcarIncerto(r.id, "Conta criada no Conta Azul sem parcela na resposta; conferindo no próximo ciclo.");
      return "incerto";
    }
    await ctx.store.marcarEnviado(r.id, { contaId: criada.contaId, parcelaId: criada.parcelaId, vencimento: montado.vencimento });
    return "enviado";
  } catch (e) {
    const msg = mensagemDeErro(e);
    if (e instanceof ContaAzulError && e.incerto) {
      await ctx.store.marcarIncerto(r.id, msg);
      return "incerto";
    }
    // Conexão caída: volta para a fila e para o ciclo; depois de reconectar segue.
    if (e instanceof ContaAzulError && e.reconectar) {
      await ctx.store.marcarErroEnvio(r.id, msg, false);
      throw e;
    }
    const transitorio = e instanceof ContaAzulError ? e.transitorio : !(e instanceof ErroDefinitivo);
    const final = !transitorio || tentativa >= MAX_TENTATIVAS;
    await ctx.store.marcarErroEnvio(r.id, msg, final);
    return final ? "erro" : "pendente";
  }
}

/** Relatório pago no Oxy VE: baixa da parcela no Conta Azul (uma vez só). */
export async function lancarBaixa(
  ctx: SyncCtx,
  rep: ReportParaPagamento,
  contaFinanceiraId: string | null,
): Promise<"baixado" | "ja_quitado" | "erro" | "ignorado"> {
  // Reserva antes do GET: duas execuções juntas veriam a parcela em aberto e
  // lançariam duas baixas.
  if (!(await ctx.store.reservarBaixa(rep.id))) return "ignorado";
  try {
    const parcela = parseParcela(await ctx.api.obterParcela(rep.ca_parcela_id));
    if (parcelaQuitada(parcela.status)) {
      await ctx.store.marcarPagoSync(rep.id);
      return "ja_quitado";
    }
    if (parcelaEncerradaSemPagamento(parcela.status)) {
      await ctx.store.marcarErroPagamento(rep.id, `Parcela ${parcela.status?.toLowerCase()} no Conta Azul; baixa não lançada.`, true);
      return "erro";
    }
    if (!contaFinanceiraId) throw new ErroDefinitivo("Conta financeira do Conta Azul não configurada.");
    const cents = parcela.naoPagoCents > 0 ? parcela.naoPagoCents : parcela.totalCents;
    if (cents <= 0) throw new ErroDefinitivo("Parcela sem valor em aberto no Conta Azul.");
    await ctx.api.criarBaixa({
      id_parcela: rep.ca_parcela_id,
      data_pagamento: hoje(ctx),
      conta_financeira: contaFinanceiraId,
      composicao_valor: { valor_bruto: centavosParaReais(cents) },
      metodo_pagamento: METODO_PIX,
      observacao: "Reembolso pago pelo Oxy VE.",
    });
    await ctx.store.marcarPagoSync(rep.id);
    return "baixado";
  } catch (e) {
    // Baixa sem resposta: na próxima, o GET da parcela mostra se entrou.
    const transitorio =
      e instanceof ContaAzulError ? e.transitorio || e.incerto || e.reconectar : !(e instanceof ErroDefinitivo);
    await ctx.store.marcarErroPagamento(rep.id, mensagemDeErro(e), !transitorio);
    if (e instanceof ContaAzulError && e.reconectar) throw e;
    return "erro";
  }
}

/** Quitada no Conta Azul e aprovada aqui: marca paga pelo caminho do banco. */
export async function conferirQuitacao(ctx: SyncCtx, rep: ReportParaPagamento): Promise<"pago" | "aberto" | "erro"> {
  try {
    const parcela = parseParcela(await ctx.api.obterParcela(rep.ca_parcela_id));
    if (parcelaQuitada(parcela.status)) {
      const marcou = await ctx.store.marcarPagoNoOxy(rep.id);
      if (!marcou) await ctx.store.marcarConferido(rep.id, null);
      return marcou ? "pago" : "aberto";
    }
    await ctx.store.marcarConferido(
      rep.id,
      parcelaEncerradaSemPagamento(parcela.status) ? `Parcela ${parcela.status?.toLowerCase()} no Conta Azul.` : null,
    );
    return "aberto";
  } catch (e) {
    await ctx.store.marcarConferido(rep.id, mensagemDeErro(e));
    if (e instanceof ContaAzulError && e.reconectar) throw e;
    return "erro";
  }
}

export interface ResumoSync {
  enviados: number;
  erros: number;
  baixas: number;
  pagos: number;
  conferidos: number;
}

/** Um ciclo completo para uma org. reconectar interrompe (sem token não adianta seguir). */
export async function sincronizarOrg(
  ctx: SyncCtx,
  org: { id: string; conta_financeira_id: string | null; last_poll_at: string | null },
  opts: { limiteEnvio?: number; forcarPolling?: boolean } = {},
): Promise<ResumoSync & { poll: boolean }> {
  const resumo = { enviados: 0, erros: 0, baixas: 0, pagos: 0, conferidos: 0, poll: false };
  const agora = (ctx.agora ?? (() => new Date()))();

  for (const id of await ctx.store.reservarPendentes(org.id, opts.limiteEnvio ?? 10)) {
    const r = await enviarRelatorio(ctx, id);
    if (r === "enviado" || r === "recuperado") resumo.enviados++;
    else if (r === "erro") resumo.erros++;
  }

  for (const rep of await ctx.store.listarParaBaixa(org.id, 20)) {
    const r = await lancarBaixa(ctx, rep, org.conta_financeira_id);
    if (r === "baixado" || r === "ja_quitado") resumo.baixas++;
    else if (r === "erro") resumo.erros++;
  }

  const ultimo = org.last_poll_at ? new Date(org.last_poll_at).getTime() : 0;
  if (opts.forcarPolling || agora.getTime() - ultimo >= POLLING_MIN * 60_000) {
    resumo.poll = true;
    for (const rep of await ctx.store.listarParaPolling(org.id, 50)) {
      const r = await conferirQuitacao(ctx, rep);
      resumo.conferidos++;
      if (r === "pago") resumo.pagos++;
    }
  }
  return resumo;
}

