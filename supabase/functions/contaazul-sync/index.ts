// contaazul-sync: envia relatórios aprovados ao Conta Azul, lança baixas dos
// pagos no Oxy VE e confere quitação lá (polling: a API não tem webhook).
//
// POST { action }
//   cron        — só sistema (pg_cron via dispatch_contaazul_sync): todas as
//                 orgs com integração ativa.
//   sincronizar — admin: roda agora para a org dele (polling forçado).
//   listar      — admin: categorias de despesa, centros de custo e contas
//                 financeiras do Conta Azul, para o de-para da tela.
//
// A regra fica em ../_shared/contaazul/sync.ts (testada no Vitest).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  APP_URL,
  SEM_CREDENCIAIS,
  apiDaOrg,
  corsHeaders,
  credenciais,
  ehSistema,
  exigirAdmin,
  json,
  serviceClient,
} from "../_shared/contaazul/edge.ts";
import { ContaAzulError, mensagemDeErro } from "../_shared/contaazul/errors.ts";
import { parseCategorias, parseCentrosCusto, parseContasFinanceiras } from "../_shared/contaazul/parse.ts";
import { criarSyncStore } from "../_shared/contaazul/store_supabase.ts";
import { sincronizarOrg } from "../_shared/contaazul/sync.ts";
import type { Credenciais } from "../_shared/contaazul/oauth.ts";

interface OrgConexao {
  org_id: string;
  conta_financeira_id: string | null;
  last_poll_at: string | null;
}

async function rodarOrg(sb: SupabaseClient, cred: Credenciais, org: OrgConexao, forcarPolling: boolean) {
  const ctx = {
    api: apiDaOrg(sb, org.org_id, cred),
    store: criarSyncStore(sb),
    appUrl: APP_URL,
    log: (msg: string, extra?: Record<string, unknown>) => console.log(JSON.stringify({ fn: "contaazul-sync", msg, ...extra })),
  };
  let erroGeral: string | null = null;
  let resumo = null;
  try {
    resumo = await sincronizarOrg(ctx, { id: org.org_id, conta_financeira_id: org.conta_financeira_id, last_poll_at: org.last_poll_at }, { forcarPolling });
  } catch (e) {
    erroGeral = mensagemDeErro(e);
    console.error("contaazul-sync:", org.org_id, e instanceof ContaAzulError ? e.status : "", erroGeral);
  }
  const agora = new Date().toISOString();
  await sb
    .from("contaazul_connection")
    .update({
      last_sync_at: agora,
      ...(resumo?.poll ? { last_poll_at: agora } : {}),
      last_error: erroGeral,
    })
    .eq("org_id", org.org_id);
  return { org_id: org.org_id, resumo, erro: erroGeral };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const sb = serviceClient();
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "";
    const cred = await credenciais(sb);

    if (action === "cron") {
      if (!ehSistema(req)) return json({ error: "unauthorized" }, 401);
      if (!cred) return json({ ok: false, error: SEM_CREDENCIAIS });
      const { data, error } = await sb
        .from("contaazul_connection")
        .select("org_id, conta_financeira_id, last_poll_at")
        .eq("ativo", true)
        .eq("precisa_reconectar", false)
        .not("refresh_token", "is", null);
      if (error) throw error;
      const resultados = [];
      // Uma org por vez: o limite de 10 req/s é por conta conectada, e assim o
      // tempo da função fica previsível.
      for (const org of (data ?? []) as OrgConexao[]) resultados.push(await rodarOrg(sb, cred, org, false));
      return json({ ok: true, resultados });
    }

    const admin = await exigirAdmin(req, sb);
    if (admin instanceof Response) return admin;
    if (!cred) return json({ error: SEM_CREDENCIAIS }, 503);

    const { data: conn } = await sb
      .from("contaazul_connection")
      .select("org_id, conta_financeira_id, last_poll_at, ativo, refresh_token, precisa_reconectar")
      .eq("org_id", admin.orgId)
      .maybeSingle();
    if (!conn?.refresh_token || conn.precisa_reconectar) {
      return json({ error: "Conta Azul não conectado. Conecte antes de continuar." }, 409);
    }

    if (action === "listar") {
      const api = apiDaOrg(sb, admin.orgId, cred);
      try {
        const categorias = parseCategorias(await api.listarCategoriasDespesa());
        const centros = parseCentrosCusto(await api.listarCentrosCusto());
        const contas = parseContasFinanceiras(await api.listarContasFinanceiras());
        return json({ categorias, centros_custo: centros, contas_financeiras: contas });
      } catch (e) {
        return json({ error: mensagemDeErro(e) }, e instanceof ContaAzulError && e.reconectar ? 409 : 502);
      }
    }

    if (action === "sincronizar") {
      if (!conn.ativo) return json({ error: "Ative o envio antes de sincronizar." }, 409);
      return json({ ok: true, ...(await rodarOrg(sb, cred, conn as OrgConexao, true)) });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (e) {
    console.error("contaazul-sync error:", e);
    return json({ error: "Erro na sincronização com o Conta Azul." }, 500);
  }
});
