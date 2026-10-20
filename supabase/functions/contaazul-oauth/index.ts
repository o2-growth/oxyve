// contaazul-oauth: conecta e desconecta o Conta Azul (OAuth2 authorization code).
//
//   GET  ?action=start         — admin (JWT): gera o state e devolve { url } do authorize.
//   GET  ?code=..&state=..     — callback do Conta Azul (sem JWT: vem do navegador).
//                                Troca o code, guarda os tokens, lê a empresa e
//                                redireciona para /app/gestao?ca=conectado.
//   POST { action: "colar", url } — admin: conclui colando o endereço de retorno (redirect de terceiro).
//   POST { action: "desconectar" } — admin: revoga lá (melhor esforço) e apaga os tokens.
//
// Precisa de verify_jwt = false (o callback não tem JWT); o start e o
// desconectar conferem o JWT aqui dentro.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  APP_URL,
  SEM_CREDENCIAIS,
  apiDaOrg,
  corsHeaders,
  credenciais,
  exigirAdmin,
  json,
  serviceClient,
} from "../_shared/contaazul/edge.ts";
import { ContaAzulApi } from "../_shared/contaazul/api.ts";
import { buildAuthorizeUrl, buildTokenRequest, gerarState, parseTokenResponse, urlRetorno } from "../_shared/contaazul/oauth.ts";
import { parseContaConectada } from "../_shared/contaazul/parse.ts";
import { criarLimitador, relogioReal } from "../_shared/contaazul/ratelimit.ts";
import { traduzirErroToken } from "../_shared/contaazul/errors.ts";

const redirecionar = (url: string) => new Response(null, { status: 302, headers: { Location: url } });

type Conclusao = { ok: true } | { ok: false; motivo: string };

/**
 * Valida o state, troca o code por tokens e grava a conexão. Usado pelo callback
 * (redirect cadastrado aponta para esta função) e pela conexão colando a URL
 * (redirect cadastrado é um site de terceiro que não carrega: o admin cola aqui
 * o endereço que ficou na barra).
 */
async function concluirConexao(
  sb: ReturnType<typeof serviceClient>,
  cred: NonNullable<Awaited<ReturnType<typeof credenciais>>>,
  code: string,
  state: string,
  orgDoAdmin: string | null,
): Promise<Conclusao> {
  // state vale uma vez só: apaga ao ler (CSRF e replay).
  const { data: st } = await sb
    .from("contaazul_oauth_state")
    .delete()
    .eq("state", state)
    .select("org_id, user_id, expires_at")
    .maybeSingle();
  if (!st || new Date(st.expires_at).getTime() < Date.now()) {
    return { ok: false, motivo: "state" };
  }
  if (!code) return { ok: false, motivo: "negado" };
  // Conexão colando a URL: quem cola tem de ser admin da mesma org do state.
  if (orgDoAdmin && orgDoAdmin !== st.org_id) return { ok: false, motivo: "permissao" };

  // Quem pediu ainda é admin da mesma org? (pode ter perdido o papel ou
  // mudado de org nos 10 min do state). A org sai do state, nunca da URL.
  const [{ data: papeis }, { data: perfil }] = await Promise.all([
    sb.from("user_roles").select("role").eq("user_id", st.user_id),
    sb.from("profiles").select("org_id").eq("id", st.user_id).maybeSingle(),
  ]);
  const aindaAdmin = (papeis ?? []).some((r: { role: string }) => r.role === "admin");
  if (!aindaAdmin || (perfil as { org_id: string | null } | null)?.org_id !== st.org_id) {
    return { ok: false, motivo: "permissao" };
  }

  const { url: tokenUrl, init } = buildTokenRequest(cred, { grant: "authorization_code", code });
  const res = await fetch(tokenUrl, { ...init, signal: AbortSignal.timeout(20_000) });
  const body = await res.json().catch(() => null);
  const tokens = res.ok ? parseTokenResponse(body) : null;
  if (!tokens) {
    console.error("contaazul-oauth: troca do code falhou", res.status, traduzirErroToken(res.status, body).mensagem);
    return { ok: false, motivo: "token" };
  }

  // Empresa conectada com o token recém-emitido (sem passar pela trava).
  const api = new ContaAzulApi({
    fetch,
    token: () => Promise.resolve(tokens.accessToken),
    aguardarVez: criarLimitador(),
    relogio: relogioReal,
  });
  let empresa = { idEmpresa: null as string | null, nome: null as string | null };
  try {
    empresa = parseContaConectada(await api.contaConectada());
  } catch (e) {
    console.error("contaazul-oauth: conta-conectada falhou", e);
  }

  // Outra empresa do Conta Azul: pessoas, contas e de-para salvos apontam
  // para a anterior e lançariam no lugar errado. Recusa e desfaz a conexão nova.
  const { data: anterior } = await sb
    .from("contaazul_connection")
    .select("id_empresa")
    .eq("org_id", st.org_id)
    .maybeSingle();
  const idAnterior = (anterior as { id_empresa: string | null } | null)?.id_empresa ?? null;
  if (idAnterior && empresa.idEmpresa && idAnterior !== empresa.idEmpresa) {
    try {
      await api.revogar(empresa.idEmpresa);
    } catch (e) {
      console.error("contaazul-oauth: revogação da empresa diferente falhou", e);
    }
    return { ok: false, motivo: "outra_empresa" };
  }

  const agora = new Date().toISOString();
  const { error } = await sb.from("contaazul_connection").upsert(
    {
      org_id: st.org_id,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_expires_at: tokens.expiresAt,
      refresh_lock_until: null,
      // Sem resposta do conta-conectada, mantém a empresa já salva.
      ...(empresa.idEmpresa ? { id_empresa: empresa.idEmpresa, empresa_nome: empresa.nome } : {}),
      connected_at: agora,
      connected_by: st.user_id,
      precisa_reconectar: false,
      last_error: null,
      updated_at: agora,
    },
    { onConflict: "org_id" },
  );
  if (error) {
    console.error("contaazul-oauth: salvar conexão falhou", error);
    return { ok: false, motivo: "banco" };
  }
  return { ok: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  const sb = serviceClient();
  const cred = await credenciais(sb);

  try {
    // ------------------------------------------------------------ callback
    if (req.method === "GET" && (url.searchParams.has("code") || url.searchParams.has("error"))) {
      const state = url.searchParams.get("state") ?? "";
      const code = url.searchParams.get("code") ?? "";
      if (!cred) return redirecionar(urlRetorno(APP_URL, "erro", "credenciais"));
      if (!state) return redirecionar(urlRetorno(APP_URL, "erro", "state"));

      const r = await concluirConexao(sb, cred, code, state, null);
      return redirecionar(r.ok ? urlRetorno(APP_URL, "conectado") : urlRetorno(APP_URL, "erro", r.motivo));
    }

    // ------------------------------------------------------------ start
    if (req.method === "GET" && url.searchParams.get("action") === "start") {
      const admin = await exigirAdmin(req, sb);
      if (admin instanceof Response) return admin;
      if (!cred) return json({ error: SEM_CREDENCIAIS }, 503);
      // Limpa states vencidos (são de uso único e curtos).
      await sb.from("contaazul_oauth_state").delete().lt("expires_at", new Date().toISOString());
      const state = gerarState();
      const { error } = await sb.from("contaazul_oauth_state").insert({
        state,
        org_id: admin.orgId,
        user_id: admin.userId,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      if (error) throw error;
      return json({ url: buildAuthorizeUrl(cred, state) });
    }

    // ------------------------------------------------------------ desconectar
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body?.action === "colar") {
        const admin = await exigirAdmin(req, sb);
        if (admin instanceof Response) return admin;
        if (!cred) return json({ error: SEM_CREDENCIAIS }, 503);
        let colada: URL;
        try {
          // O authorize do Conta Azul usa '#'; o retorno vem em query normal, mas aceita os dois.
          colada = new URL(String(body.url ?? "").trim().replace("#/", ""));
        } catch {
          return json({ error: "Endereço inválido. Copie a URL inteira da barra do navegador." }, 400);
        }
        const code = colada.searchParams.get("code") ?? "";
        const state = colada.searchParams.get("state") ?? "";
        if (!code || !state) return json({ error: "O endereço não tem code e state. Copie a URL inteira depois de autorizar." }, 400);
        const r = await concluirConexao(sb, cred, code, state, admin.orgId);
        if (r.ok) return json({ ok: true });
        const MOTIVOS: Record<string, string> = {
          state: "A autorização expirou. Clique em Conectar de novo e cole o novo endereço em até 3 minutos.",
          permissao: "Só um admin da empresa pode concluir a conexão.",
          token: "O Conta Azul recusou o código (ele vale 3 minutos e uma vez só). Clique em Conectar de novo.",
          outra_empresa: "Essa autorização é de outra empresa do Conta Azul.",
          negado: "A autorização foi negada no Conta Azul.",
          banco: "Não foi possível salvar a conexão. Tente de novo.",
        };
        return json({ error: MOTIVOS[r.motivo] ?? "Não foi possível concluir a conexão." }, 400);
      }
      if (body?.action !== "desconectar") return json({ error: "Ação desconhecida." }, 400);
      const admin = await exigirAdmin(req, sb);
      if (admin instanceof Response) return admin;

      const { data: conn } = await sb
        .from("contaazul_connection")
        .select("id_empresa, refresh_token")
        .eq("org_id", admin.orgId)
        .maybeSingle();
      // Revoga lá para o refresh token morrer de vez; se falhar, apaga aqui mesmo.
      if (cred && conn?.refresh_token && conn.id_empresa) {
        try {
          await apiDaOrg(sb, admin.orgId, cred).revogar(conn.id_empresa);
        } catch (e) {
          console.error("contaazul-oauth: revogação falhou", e);
        }
      }
      const { error } = await sb
        .from("contaazul_connection")
        .update({
          access_token: null,
          refresh_token: null,
          token_expires_at: null,
          refresh_lock_until: null,
          ativo: false,
          precisa_reconectar: false,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("org_id", admin.orgId);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Requisição inválida." }, 400);
  } catch (e) {
    console.error("contaazul-oauth error:", e);
    return json({ error: "Erro na conexão com o Conta Azul." }, 500);
  }
});
