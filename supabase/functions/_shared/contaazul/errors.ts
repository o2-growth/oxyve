// Erros do Conta Azul em pt-BR legível para o admin. Módulo puro.
//
// transitorio: vale tentar de novo sozinho (429, 5xx, rede).
// reconectar: o acesso caiu (token revogado/expirado); só um admin resolve.

export interface ErroTraduzido {
  mensagem: string;
  transitorio: boolean;
  reconectar: boolean;
}

/** Erro de uma chamada ao Conta Azul, com a tradução já pronta. */
export class ContaAzulError extends Error {
  status: number | null;
  body: unknown;
  transitorio: boolean;
  reconectar: boolean;
  /** POST sem resposta: pode ter sido criado lá. Quem chamou precisa conferir. */
  incerto: boolean;

  constructor(t: ErroTraduzido, status: number | null, body: unknown, incerto = false) {
    super(t.mensagem);
    this.name = "ContaAzulError";
    this.status = status;
    this.body = body;
    this.transitorio = t.transitorio;
    this.reconectar = t.reconectar;
    this.incerto = incerto;
  }
}

/** Texto de detalhe que o Conta Azul manda, nos formatos que aparecem na API. */
export function detalheDoCorpo(body: unknown): string | null {
  if (!body) return null;
  if (typeof body === "string") return body.trim().slice(0, 300) || null;
  if (typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const partes: string[] = [];
  for (const k of ["error_description", "message", "mensagem", "error", "detail"]) {
    const v = b[k];
    if (typeof v === "string" && v.trim()) partes.push(v.trim());
  }
  const lista = b.errors ?? b.erros ?? b.details;
  if (Array.isArray(lista)) {
    for (const item of lista) {
      if (typeof item === "string") partes.push(item);
      else if (item && typeof item === "object") {
        const it = item as Record<string, unknown>;
        const msg = it.message ?? it.mensagem ?? it.error ?? it.descricao;
        const campo = it.field ?? it.campo;
        if (typeof msg === "string") partes.push(typeof campo === "string" ? `${campo}: ${msg}` : msg);
      }
    }
  }
  // "invalid_grant" sozinho não diz nada a quem lê; a descrição diz.
  const unicas = [...new Set(partes)].filter((p) => !/^invalid_[a-z_]+$/.test(p) || partes.length === 1);
  return unicas.length ? unicas.join("; ").slice(0, 300) : null;
}

/** Tradução de uma resposta HTTP de erro (status null = sem resposta). */
export function traduzirErro(status: number | null, body: unknown, acao: string): ErroTraduzido {
  const detalhe = detalheDoCorpo(body);
  const com = (base: string) => (detalhe ? `${base}: ${detalhe}` : `${base}.`);

  if (status === null) {
    return {
      mensagem: `Sem resposta do Conta Azul ao ${acao}. Nova tentativa automática no próximo ciclo.`,
      transitorio: true,
      reconectar: false,
    };
  }
  if (status === 401) {
    return {
      mensagem: "Acesso ao Conta Azul expirou ou foi revogado. Reconecte na aba Conta Azul da Gestão.",
      transitorio: false,
      reconectar: true,
    };
  }
  if (status === 403) {
    return { mensagem: com(`Sem permissão no Conta Azul para ${acao}`), transitorio: false, reconectar: false };
  }
  if (status === 404) {
    return { mensagem: com(`Registro não encontrado no Conta Azul ao ${acao}`), transitorio: false, reconectar: false };
  }
  if (status === 429) {
    return {
      mensagem: "Limite de requisições do Conta Azul atingido. Nova tentativa automática no próximo ciclo.",
      transitorio: true,
      reconectar: false,
    };
  }
  if (status >= 500) {
    return {
      mensagem: `Conta Azul indisponível (erro ${status}) ao ${acao}. Nova tentativa automática no próximo ciclo.`,
      transitorio: true,
      reconectar: false,
    };
  }
  return { mensagem: com(`Conta Azul recusou ao ${acao}`), transitorio: false, reconectar: false };
}

/**
 * Falha na renovação do token (POST /oauth/token): invalid_grant é acesso
 * revogado ou refresh token já usado — nos dois casos só reconectando.
 */
export function traduzirErroToken(status: number | null, body: unknown): ErroTraduzido {
  if (status === null || status === 429 || (status !== null && status >= 500)) {
    return traduzirErro(status, body, "renovar o acesso");
  }
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const sub = typeof b.error_subtype === "string" ? b.error_subtype : "";
  if (b.error === "invalid_grant" || status === 401) {
    const motivo =
      sub === "access_revoked"
        ? "O acesso foi revogado no Conta Azul"
        : sub === "invalid_refresh_token"
          ? "A credencial salva não vale mais"
          : "O acesso ao Conta Azul expirou";
    return { mensagem: `${motivo}. Reconecte na aba Conta Azul da Gestão.`, transitorio: false, reconectar: true };
  }
  if (b.error === "invalid_client") {
    return {
      mensagem: "Credenciais do app Conta Azul inválidas (CONTAAZUL_CLIENT_ID/SECRET).",
      transitorio: false,
      reconectar: false,
    };
  }
  return traduzirErro(status, body, "renovar o acesso");
}

/** Erro que não vale repetir sozinho (falta de cadastro, de-para). Texto já é para o admin. */
export class ErroDefinitivo extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDefinitivo";
  }
}

/** Erro qualquer (ContaAzulError ou outro) em texto para ca_error. */
export function mensagemDeErro(e: unknown): string {
  if (e instanceof ContaAzulError || e instanceof ErroDefinitivo) return e.message;
  if (e instanceof Error && e.message) return `Erro inesperado: ${e.message}`.slice(0, 300);
  return "Erro inesperado na integração com o Conta Azul.";
}
