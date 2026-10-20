/**
 * Erro de permissão vindo do Supabase: RLS (42501 / "row-level security"),
 * privilégio do Postgres ou o "Acesso restrito" que as RPCs de gestão levantam.
 * Serve para a tela não chamar queda de rede de "sem permissão" (nem o contrário).
 */
export function isPermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown; status?: unknown };
  if (e.code === '42501' || e.status === 403) return true;
  const msg = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  return (
    msg.includes('row-level security') ||
    msg.includes('permission denied') ||
    msg.includes('acesso restrito')
  );
}
