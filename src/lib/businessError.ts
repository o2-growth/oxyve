/**
 * Recusa de regra de negócio (RAISE EXCEPTION no banco, código P0001) já vem em
 * pt-BR e explica o que fazer ("Revise todos os itens antes de aprovar (2 de 5
 * revisados)."); vai direto no toast. Erro técnico ganha um prefixo.
 */
export function decisionErrorMessage(error: unknown, prefix: string): string {
  const e = (error ?? {}) as { code?: unknown; message?: unknown };
  const msg = typeof e.message === 'string' ? e.message.trim() : '';
  if (e.code === 'P0001' && msg) return msg;
  return `${prefix}${msg || 'tente novamente.'}`;
}
