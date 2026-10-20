// contaazul-oauth: conecta e desconecta o Conta Azul (OAuth2 authorization code).
//
//   GET  ?action=start         — admin (JWT): gera o state e devolve { url } do authorize.
//   GET  ?code=..&state=..     — callback do Conta Azul (sem JWT: vem do navegador).
//                                Troca o code, guarda os tokens, lê a empresa e
//                                redireciona para /app/gestao?ca=conectado.
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  const sb = serviceClient();
  const cred = credenciais();

  try {
    // ------------------------------------------------------------ callback
    if (req.method === "GET" && (url.searchParams.has("code") || url.searchParams.has("error"))) {
      const state = url.searchParams.get("state") ?? "";
      const code = url.searchParams.get("code") ?? "";
      if (!cred) return redirecionar(urlRetorno(APP_URL, "erro", "credenciais"));
      if (!state) return redirecionar(urlRetorno(APP_URL, "erro", "state"));

      // state vale uma vez só: apaga ao ler (CSRF e replay).
      const { data: st } = await sb
        .from("contaazul_oauth_state")
        .delete()
        .eq("state", state)
        .select("org_id, user_id, expires_at")
        .maybeSingle();
      if (!st || new Date(st.expires_at).getTime() < Date.now()) {
        return redirecionar(urlRetorno(APP_URL, "erro", "state"));
      }
      if (!code) return redirecionar(urlRetorno(APP_URL, "erro", "negado"));

      const { url: tokenUrl, init } = buildTokenRequest(cred, { grant: "authorization_code", code });
      const res = await fetch(tokenUrl, { ...init, signal: AbortSignal.timeout(20_000) });
      const body = await res.json().catch(() => null);
      const tokens = res.ok ? parseTokenResponse(body) : null;
      if (!tokens) {
        console.error("contaazul-oauth: troca do code falhou", res.status, traduzirErroToken(res.status, body).mensagem);
        return redirecionar(urlRetorno(APP_URL, "erro", "token"));
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

      const agora = new Date().toISOString();
      const { error } = await sb.from("contaazul_connection").upsert(
        {
          org_id: st.org_id,
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          token_expires_at: tokens.expiresAt,
          refresh_lock_until: null,
          id_empresa: empresa.idEmpresa,
          empresa_nome: empresa.nome,
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
        return redirecionar(urlRetorno(APP_URL, "erro", "banco"));
      }
      return redirecionar(urlRetorno(APP_URL, "conectado"));
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
