// SyncStore e TokenStore sobre o client service_role do Supabase. Só roda no
// Deno (edge functions); a regra fica nos módulos puros ao lado.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { ReportData, ReportParaPagamento, SyncStore } from "./sync.ts";
import type { ConexaoTokens, TokenStore } from "./tokens.ts";
import type { Tokens } from "./oauth.ts";

function falha(op: string, error: { message?: string } | null): never {
  throw new Error(`Falha no banco ao ${op}: ${error?.message ?? "erro desconhecido"}`);
}

export function criarTokenStore(sb: SupabaseClient): TokenStore {
  return {
    async lerConexao(orgId) {
      const { data, error } = await sb
        .from("contaazul_connection")
        .select("access_token, refresh_token, token_expires_at, precisa_reconectar")
        .eq("org_id", orgId)
        .maybeSingle();
      if (error) falha("ler a conexão", error);
      return (data as ConexaoTokens | null) ?? null;
    },
    async travarRenovacao(orgId) {
      const { data, error } = await sb.rpc("contaazul_try_lock_refresh", { p_org: orgId, p_seconds: 30 });
      if (error) falha("travar a renovação", error);
      return data === true;
    },
    async salvarTokens(orgId, t: Tokens) {
      const { error } = await sb
        .from("contaazul_connection")
        .update({
          access_token: t.accessToken,
          refresh_token: t.refreshToken,
          token_expires_at: t.expiresAt,
          refresh_lock_until: null,
          precisa_reconectar: false,
          updated_at: new Date().toISOString(),
        })
        .eq("org_id", orgId);
      if (error) falha("salvar os tokens", error);
    },
    async soltarTrava(orgId) {
      await sb.from("contaazul_connection").update({ refresh_lock_until: null }).eq("org_id", orgId);
    },
    async marcarReconectar(orgId, mensagem) {
      await sb
        .from("contaazul_connection")
        .update({ precisa_reconectar: true, last_error: mensagem, updated_at: new Date().toISOString() })
        .eq("org_id", orgId);
    },
  };
}

export function criarSyncStore(sb: SupabaseClient): SyncStore {
  const agora = () => new Date().toISOString();
  const upd = async (op: string, id: string, campos: Record<string, unknown>, soSeStatus?: string) => {
    let q = sb.from("reports").update(campos).eq("id", id);
    if (soSeStatus) q = q.eq("ca_status", soSeStatus);
    const { error } = await q;
    if (error) falha(op, error);
  };
  const lista = async (orgId: string, status: string, limite: number, ordenarConferencia: boolean) => {
    let q = sb
      .from("reports")
      .select("id, ca_parcela_id")
      .eq("org_id", orgId)
      .eq("status", status)
      .eq("ca_status", "enviado")
      .not("ca_parcela_id", "is", null);
    if (ordenarConferencia) q = q.order("ca_checked_at", { ascending: true, nullsFirst: true });
    const { data, error } = await q.limit(limite);
    if (error) falha("listar relatórios enviados", error);
    return (data ?? []) as ReportParaPagamento[];
  };

  return {
    async reservarPendentes(orgId, limite) {
      const { data, error } = await sb.rpc("contaazul_claim_pendentes", { p_org: orgId, p_limit: limite });
      if (error) falha("reservar relatórios", error);
      return ((data ?? []) as unknown[]).map((x) =>
        typeof x === "string" ? x : String((x as Record<string, unknown>).contaazul_claim_pendentes ?? ""),
      ).filter(Boolean);
    },
    async dadosRelatorio(reportId) {
      const { data, error } = await sb.rpc("contaazul_report_data", { p_report_id: reportId });
      if (error) falha("ler o relatório", error);
      return (data as ReportData | null) ?? null;
    },
    async salvarPessoa(userId, pessoaId) {
      const { error } = await sb.from("profiles").update({ ca_pessoa_id: pessoaId }).eq("id", userId);
      if (error) falha("salvar a pessoa do Conta Azul", error);
    },
    salvarVencimento: (id, vencimento) => upd("salvar o vencimento", id, { ca_vencimento: vencimento }),
    marcarEnviado: (id, r) =>
      upd("marcar enviado", id, {
        ca_status: "enviado",
        ca_conta_id: r.contaId,
        ca_parcela_id: r.parcelaId,
        ca_vencimento: r.vencimento,
        ca_sent_at: agora(),
        ca_error: null,
      }),
    marcarErroEnvio: (id, mensagem, final) =>
      upd("marcar erro", id, { ca_status: final ? "erro" : "pendente", ca_error: mensagem }, "enviando"),
    marcarIncerto: (id, mensagem) => upd("marcar envio incerto", id, { ca_error: mensagem }, "enviando"),
    listarParaBaixa: (orgId, limite) => lista(orgId, "paid", limite, false),
    async reservarBaixa(reportId) {
      const { data, error } = await sb.rpc("contaazul_claim_baixa", { p_report_id: reportId });
      if (error) falha("reservar a baixa", error);
      return data === true;
    },
    listarParaPolling: (orgId, limite) => lista(orgId, "approved", limite, true),
    marcarPagoSync: (id) => upd("marcar pago", id, { ca_status: "pago_sync", ca_error: null, ca_checked_at: agora() }),
    marcarErroPagamento: (id, mensagem, final) =>
      upd("marcar erro do pagamento", id, final ? { ca_status: "erro", ca_error: mensagem } : { ca_error: mensagem }),
    marcarConferido: (id, aviso) => upd("marcar conferido", id, { ca_checked_at: agora(), ca_error: aviso }),
    async marcarPagoNoOxy(reportId) {
      const { data, error } = await sb.rpc("contaazul_marcar_pago", { p_report_id: reportId });
      if (error) falha("marcar o relatório como pago", error);
      return data === true;
    },
  };
}
