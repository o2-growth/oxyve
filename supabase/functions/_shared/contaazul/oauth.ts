// OAuth2 (authorization code) do Conta Azul. Módulo puro.
//
// - authorize: login.contaazul.com com fragmento (#/oauth/authorize), montado
//   como string porque URL() trataria o resto como hash.
// - token: POST api-v2.contaazul.com/oauth/token, Basic base64(id:secret),
//   form-urlencoded. Access vale 1 h; o refresh token roda a cada renovação.

export const AUTHORIZE_URL = "https://login.contaazul.com/#/oauth/authorize";
export const TOKEN_URL = "https://api-v2.contaazul.com/oauth/token";
// Fixo pela documentação, já com "+" no lugar de espaço.
export const SCOPE = "openid+profile+aws.cognito.signin.user.admin";

export interface Credenciais {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** ISO 8601 */
  expiresAt: string;
}

export function buildAuthorizeUrl(c: Pick<Credenciais, "clientId" | "redirectUri">, state: string): string {
  return (
    `${AUTHORIZE_URL}?response_type=code` +
    `&client_id=${encodeURIComponent(c.clientId)}` +
    `&redirect_uri=${encodeURIComponent(c.redirectUri)}` +
    `&state=${encodeURIComponent(state)}` +
    `&scope=${SCOPE}`
  );
}

/** base64 de "id:secret" em UTF-8 (btoa sozinho quebra com acento). */
export function basicAuth(clientId: string, clientSecret: string): string {
  const bytes = new TextEncoder().encode(`${clientId}:${clientSecret}`);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `Basic ${btoa(bin)}`;
}

export type GrantTipo =
  | { grant: "authorization_code"; code: string }
  | { grant: "refresh_token"; refreshToken: string };

export function buildTokenRequest(c: Credenciais, g: GrantTipo): { url: string; init: RequestInit } {
  const form = new URLSearchParams();
  if (g.grant === "authorization_code") {
    form.set("grant_type", "authorization_code");
    form.set("code", g.code);
    form.set("redirect_uri", c.redirectUri);
  } else {
    form.set("grant_type", "refresh_token");
    form.set("refresh_token", g.refreshToken);
  }
  return {
    url: TOKEN_URL,
    init: {
      method: "POST",
      headers: {
        Authorization: basicAuth(c.clientId, c.clientSecret),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: form.toString(),
    },
  };
}

/** Resposta do /oauth/token → tokens; null se faltar campo essencial. */
export function parseTokenResponse(body: unknown, agora: Date = new Date()): Tokens | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.access_token !== "string" || !b.access_token) return null;
  if (typeof b.refresh_token !== "string" || !b.refresh_token) return null;
  const exp = typeof b.expires_in === "number" && b.expires_in > 0 ? b.expires_in : 3600;
  return {
    accessToken: b.access_token,
    refreshToken: b.refresh_token,
    expiresAt: new Date(agora.getTime() + exp * 1000).toISOString(),
  };
}

/** Renova com folga de 2 min para não usar token que vence no meio do ciclo. */
export function precisaRenovar(expiresAt: string | null | undefined, agora: Date = new Date(), folgaMs = 120_000): boolean {
  if (!expiresAt) return true;
  const t = new Date(expiresAt).getTime();
  return Number.isNaN(t) || t - agora.getTime() <= folgaMs;
}

/** state aleatório (CSRF) em hex, 32 bytes. */
export function gerarState(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Destino do navegador depois do callback. */
export function urlRetorno(appUrl: string, resultado: "conectado" | "erro", motivo?: string): string {
  const base = `${appUrl.replace(/\/+$/, "")}/app/gestao?ca=${resultado}`;
  return motivo ? `${base}&motivo=${encodeURIComponent(motivo)}` : base;
}
