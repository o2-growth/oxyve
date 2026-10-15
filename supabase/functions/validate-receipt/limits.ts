// Limites de entrada do validate-receipt. Módulo puro (sem Deno) para poder
// ser testado no Vitest do app.

// ~8 MB de base64 ≈ 6 MB de imagem. Acima disso a OpenAI cobra o máximo de
// tiles com detail "high" sem ganho de leitura, e o corpo pesa na função.
export const MAX_IMAGE_BASE64_CHARS = 8_000_000;

// Folga para o JSON em volta do base64 (mime_type, chaves, aspas).
export const MAX_BODY_BYTES = MAX_IMAGE_BASE64_CHARS + 64 * 1024;

export const PAYLOAD_TOO_LARGE_MESSAGE =
  "Imagem muito grande para leitura automática. Envie uma foto menor (até ~6 MB).";

export const GENERIC_ERROR_MESSAGE = "Erro ao analisar comprovante";

/** Content-Length declarado acima do limite: recusa sem ler o corpo. */
export function isDeclaredBodyTooLarge(contentLength: string | null): boolean {
  if (!contentLength) return false;
  const n = Number(contentLength);
  return Number.isFinite(n) && n > MAX_BODY_BYTES;
}

/** Base64 da imagem acima do limite (vale também sem Content-Length). */
export function isImageTooLarge(imageBase64: unknown): boolean {
  return typeof imageBase64 === "string" && imageBase64.length > MAX_IMAGE_BASE64_CHARS;
}

// Cota por usuário (consume_receipt_validation_quota, migration 20261015121000):
// cada leitura chama a OpenAI e custa; o banco conta por hora e diz se pode.
export const QUOTA_RPC = "consume_receipt_validation_quota";

export const RATE_LIMIT_MESSAGE =
  "Limite de leituras automáticas atingido. Preencha data e valor à mão — a despesa pode ser salva normalmente.";

export const OPENAI_BUSY_MESSAGE =
  "Leitura automática ocupada agora. Preencha data e valor à mão ou tente de novo em instantes.";

export type QuotaOutcome = "allowed" | "exceeded" | "unavailable";

/**
 * Interpreta o retorno da RPC. A função ainda não existir no banco (deploy da
 * função antes da migration: PGRST202/42883) não pode derrubar a leitura, então
 * libera; qualquer outro erro recusa para não abrir a cota.
 */
export function quotaOutcome(res: { data: unknown; error: { code?: string } | null }): QuotaOutcome {
  if (res.error) {
    return res.error.code === "PGRST202" || res.error.code === "42883" ? "allowed" : "unavailable";
  }
  return res.data === true ? "allowed" : "exceeded";
}
