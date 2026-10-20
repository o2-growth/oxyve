// Access token da conexão, renovado com trava no banco. Módulo puro.
//
// O refresh token do Conta Azul roda a cada renovação: se duas execuções
// renovassem juntas, a segunda usaria um refresh já invalidado e a conexão
// cairia. Quem pega a trava renova; os outros esperam e releem.

import { ContaAzulError, traduzirErroToken } from "./errors.ts";
import { buildTokenRequest, parseTokenResponse, precisaRenovar, type Credenciais, type Tokens } from "./oauth.ts";
import type { Relogio } from "./ratelimit.ts";
import { comTimeout } from "./api.ts";

export interface ConexaoTokens {
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  precisa_reconectar?: boolean | null;
}

export interface TokenStore {
  lerConexao(orgId: string): Promise<ConexaoTokens | null>;
  travarRenovacao(orgId: string): Promise<boolean>;
  /** Grava os tokens novos e solta a trava. */
  salvarTokens(orgId: string, t: Tokens): Promise<void>;
  soltarTrava(orgId: string): Promise<void>;
  marcarReconectar(orgId: string, mensagem: string): Promise<void>;
}

export interface TokenDeps {
  store: TokenStore;
  fetch: typeof fetch;
  credenciais: Credenciais;
  relogio: Relogio;
  agora?: () => Date;
}

const RECONECTAR = {
  mensagem: "Conta Azul não conectado. Conecte na aba Conta Azul da Gestão.",
  transitorio: false,
  reconectar: true,
};

export async function obterAccessToken(
  orgId: string,
  deps: TokenDeps,
  forcar?: { rejeitado: string },
): Promise<string> {
  const agora = deps.agora ?? (() => new Date());
  let conn = await deps.store.lerConexao(orgId);
  if (!conn?.refresh_token || conn.precisa_reconectar) throw new ContaAzulError(RECONECTAR, null, null);

  const valido = (c: ConexaoTokens) =>
    !!c.access_token && !precisaRenovar(c.token_expires_at, agora()) && (!forcar || c.access_token !== forcar.rejeitado);
  if (valido(conn)) return conn.access_token as string;

  for (let i = 0; i < 6; i++) {
    if (await deps.store.travarRenovacao(orgId)) {
      try {
        // Outra execução pode ter renovado entre a leitura e a trava.
        conn = await deps.store.lerConexao(orgId);
        if (!conn?.refresh_token) throw new ContaAzulError(RECONECTAR, null, null);
        if (valido(conn)) return conn.access_token as string;

        const { url, init } = buildTokenRequest(deps.credenciais, { grant: "refresh_token", refreshToken: conn.refresh_token });
        let res: Response;
        try {
          res = await deps.fetch(url, { ...init, signal: comTimeout(20_000) });
        } catch {
          throw new ContaAzulError(traduzirErroToken(null, null), null, null);
        }
        const txt = await res.text();
        let body: unknown = null;
        try {
          body = txt ? JSON.parse(txt) : null;
        } catch {
          body = txt;
        }
        if (!res.ok) {
          const t = traduzirErroToken(res.status, body);
          if (t.reconectar) await deps.store.marcarReconectar(orgId, t.mensagem);
          throw new ContaAzulError(t, res.status, body);
        }
        const tokens = parseTokenResponse(body, agora());
        if (!tokens) {
          throw new ContaAzulError(
            { mensagem: "Resposta inesperada do Conta Azul ao renovar o acesso.", transitorio: true, reconectar: false },
            res.status,
            body,
          );
        }
        // Grava já: o refresh antigo deixou de valer nesta resposta.
        await deps.store.salvarTokens(orgId, tokens);
        return tokens.accessToken;
      } finally {
        await deps.store.soltarTrava(orgId);
      }
    }
    await deps.relogio.sleep(1000);
    conn = await deps.store.lerConexao(orgId);
    if (conn && valido(conn)) return conn.access_token as string;
  }
  throw new ContaAzulError(
    { mensagem: "Renovação do acesso ao Conta Azul em andamento. Nova tentativa no próximo ciclo.", transitorio: true, reconectar: false },
    null,
    null,
  );
}
