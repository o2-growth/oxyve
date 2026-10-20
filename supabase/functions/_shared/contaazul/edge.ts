// Peças comuns das edges contaazul-oauth e contaazul-sync (Deno).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ContaAzulApi } from "./api.ts";
import type { Credenciais } from "./oauth.ts";
import { criarLimitador, relogioReal } from "./ratelimit.ts";
import { criarTokenStore } from "./store_supabase.ts";
import { obterAccessToken } from "./tokens.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-dispatch-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export const APP_URL = (Deno.env.get("APP_URL") || "https://oxyve.vercel.app").replace(/\/+$/, "");

export function env(nome: string): string {
  const v = Deno.env.get(nome);
  if (!v) throw new Error(`Variável ${nome} não configurada`);
  return v;
}

export function serviceClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Credenciais do app no portal do Conta Azul; null se faltar alguma. Vêm das env
 * CONTAAZUL_* ou, se não houver, do Vault (contaazul_app_credentials, só service_role).
 */
export async function credenciais(sb: SupabaseClient): Promise<Credenciais | null> {
  let clientId = Deno.env.get("CONTAAZUL_CLIENT_ID");
  let clientSecret = Deno.env.get("CONTAAZUL_CLIENT_SECRET");
  let redirectUri = Deno.env.get("CONTAAZUL_REDIRECT_URI");
  if (!clientId || !clientSecret || !redirectUri) {
    const { data, error } = await sb.rpc("contaazul_app_credentials");
    if (error) console.error("contaazul: leitura das credenciais no Vault falhou", error.message);
    const v = (data ?? {}) as { client_id?: string; client_secret?: string; redirect_uri?: string };
    clientId ||= v.client_id ?? undefined;
    clientSecret ||= v.client_secret ?? undefined;
    redirectUri ||= v.redirect_uri ?? undefined;
  }
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export const SEM_CREDENCIAIS =
  "Integração sem credenciais: configure CONTAAZUL_CLIENT_ID, CONTAAZUL_CLIENT_SECRET e CONTAAZUL_REDIRECT_URI.";

/** Chamada do cron: x-dispatch-token (ou a própria service key no bearer). */
export function ehSistema(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const dispatch = Deno.env.get("DISPATCH_TOKEN");
  return (!!service && jwt === service) || (!!dispatch && req.headers.get("x-dispatch-token") === dispatch);
}

/** Admin autenticado pelo JWT do app; devolve a org dele ou a resposta de erro. */
export async function exigirAdmin(
  req: Request,
  sb: SupabaseClient,
): Promise<{ userId: string; orgId: string } | Response> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return json({ error: "unauthorized" }, 401);
  const jwt = auth.slice(7).trim();
  const { data, error } = await sb.auth.getUser(jwt);
  if (error || !data?.user) return json({ error: "unauthorized" }, 401);
  const userId = data.user.id;
  const [{ data: roles }, { data: perfil }] = await Promise.all([
    sb.from("user_roles").select("role").eq("user_id", userId),
    sb.from("profiles").select("org_id").eq("id", userId).maybeSingle(),
  ]);
  const admin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
  if (!admin) return json({ error: "Acesso restrito a administradores." }, 403);
  const orgId = (perfil as { org_id: string | null } | null)?.org_id;
  if (!orgId) return json({ error: "Usuário sem organização." }, 403);
  return { userId, orgId };
}

/** Cliente da API para uma org, com token renovado sob trava e limite de 10 req/s. */
export function apiDaOrg(sb: SupabaseClient, orgId: string, cred: Credenciais): ContaAzulApi {
  const tokenDeps = { store: criarTokenStore(sb), fetch, credenciais: cred, relogio: relogioReal };
  return new ContaAzulApi({
    fetch,
    token: (forcar) => obterAccessToken(orgId, tokenDeps, forcar),
    aguardarVez: criarLimitador(),
    relogio: relogioReal,
  });
}
