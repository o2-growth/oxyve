// Cliente HTTP do Conta Azul (api-v2). Sem Deno: fetch, token e limitador são
// injetados, para o sync ser testado no Vitest com um fetch falso.
//
// Só endpoints que existem nas specs oficiais (financeiro novo + pessoas).

import { ContaAzulError, traduzirErro } from "./errors.ts";
import { parsePagina } from "./parse.ts";
import type { Relogio } from "./ratelimit.ts";

export const API_BASE = "https://api-v2.contaazul.com";

export type Query = Record<string, string | number | boolean | string[] | null | undefined>;

export interface ApiDeps {
  fetch: typeof fetch;
  /** Access token válido. forcar=true depois de um 401 com o token atual. */
  token: (forcar?: { rejeitado: string }) => Promise<string>;
  aguardarVez: () => Promise<void>;
  relogio: Relogio;
  baseUrl?: string;
  timeoutMs?: number;
}

/** Timeout do fetch (AbortSignal.timeout não existe em todo runtime de teste). */
export function comTimeout(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(ms) : undefined;
}

export function montarUrl(base: string, path: string, query?: Query): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === null || v === undefined || v === "") continue;
    // Arrays vão separados por vírgula (style=form, explode=false nas specs).
    qs.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = qs.toString();
  return `${base}${path}${s ? `?${s}` : ""}`;
}

async function lerCorpo(res: Response): Promise<unknown> {
  const txt = await res.text();
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

export class ContaAzulApi {
  private d: ApiDeps;
  constructor(deps: ApiDeps) {
    this.d = deps;
  }

  /**
   * Uma chamada com as regras da integração:
   * - 401: renova o token uma vez e repete;
   * - 429: espera e repete (até 2x);
   * - 5xx/rede em GET: repete uma vez. Em POST não repete: pode já ter criado
   *   lá. Sem resposta num POST, o erro sai marcado como incerto.
   */
  async request(
    method: "GET" | "POST" | "DELETE",
    path: string,
    acao: string,
    opts: { query?: Query; body?: unknown } = {},
  ): Promise<unknown> {
    const url = montarUrl(this.d.baseUrl ?? API_BASE, path, opts.query);
    let token = await this.d.token();
    let renovou = false;
    let tentativas429 = 0;
    let tentativas5xx = 0;

    for (;;) {
      await this.d.aguardarVez();
      let res: Response;
      try {
        res = await this.d.fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: comTimeout(this.d.timeoutMs ?? 20_000),
        });
      } catch (_e) {
        if (method === "GET" && tentativas5xx < 1) {
          tentativas5xx++;
          await this.d.relogio.sleep(500);
          continue;
        }
        throw new ContaAzulError(traduzirErro(null, null, acao), null, null, method === "POST");
      }

      if (res.ok) return await lerCorpo(res);
      const body = await lerCorpo(res);

      if (res.status === 401 && !renovou) {
        renovou = true;
        token = await this.d.token({ rejeitado: token });
        continue;
      }
      if (res.status === 429 && tentativas429 < 2) {
        tentativas429++;
        const ra = Number(res.headers.get("retry-after"));
        await this.d.relogio.sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 5) * 1000 : 1000 * tentativas429);
        continue;
      }
      if (res.status >= 500 && method === "GET" && tentativas5xx < 1) {
        tentativas5xx++;
        await this.d.relogio.sleep(500);
        continue;
      }
      throw new ContaAzulError(
        traduzirErro(res.status, body, acao),
        res.status,
        body,
        method === "POST" && res.status >= 500,
      );
    }
  }

  /** Todas as páginas de uma listagem do financeiro (limite de segurança: 20). */
  async listarTodas(path: string, acao: string, query: Query = {}, tamanho = 100, chave = "itens"): Promise<unknown[]> {
    const todos: unknown[] = [];
    for (let pagina = 1; pagina <= 20; pagina++) {
      const body = await this.request("GET", path, acao, { query: { ...query, pagina, tamanho_pagina: tamanho } });
      const { itens, total } = parsePagina(body, chave);
      todos.push(...itens);
      if (itens.length < tamanho || (total !== null && todos.length >= total)) break;
    }
    return todos;
  }

  contaConectada() {
    return this.request("GET", "/v1/pessoas/conta-conectada", "ler a empresa conectada");
  }

  buscarPessoas(documento: string, tipoPerfil: "Fornecedor" | "Cliente") {
    return this.request("GET", "/v1/pessoas", "buscar o funcionário", {
      query: { documentos: documento, tipo_perfil: tipoPerfil, tamanho_pagina: 10 },
    });
  }

  criarPessoa(body: unknown) {
    return this.request("POST", "/v1/pessoas", "cadastrar o funcionário", { body });
  }

  criarContaAPagar(body: unknown) {
    return this.request("POST", "/v1/financeiro/contas-a-pagar", "criar a conta a pagar", { body });
  }

  buscarContasAPagar(query: Query) {
    return this.request("GET", "/v1/financeiro/contas-a-pagar", "procurar a conta a pagar", {
      query: { tamanho_pagina: 50, ...query },
    });
  }

  obterParcela(id: string) {
    return this.request("GET", `/v1/financeiro/parcelas/${encodeURIComponent(id)}`, "consultar a parcela");
  }

  criarBaixa(body: unknown) {
    return this.request("POST", "/v1/financeiro/baixas", "lançar a baixa", { body });
  }

  listarCategoriasDespesa() {
    return this.listarTodas("/v1/financeiro/categorias", "listar as categorias", { tipo: "DESPESA" }, 500);
  }

  listarCentrosCusto() {
    return this.listarTodas("/v1/financeiro/centros-de-custo", "listar os centros de custo", { filtro_rapido: "ATIVO" });
  }

  listarContasFinanceiras() {
    return this.listarTodas("/v1/financeiro/contas-financeiras", "listar as contas financeiras", { apenas_ativo: true });
  }

  /** Encerra a conexão do app com a empresa (204 mesmo se já revogada). */
  revogar(idEmpresa: string) {
    return this.request("DELETE", `/oauth/connections/${encodeURIComponent(idEmpresa)}`, "desconectar");
  }
}
