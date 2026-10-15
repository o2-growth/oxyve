/**
 * Limpeza do Cache Storage no logout.
 *
 * Apaga todo cache de runtime do service worker (imagens, fontes e os caches
 * antigos do Supabase), mas preserva o precache do app (prefixo do Workbox),
 * para o app continuar abrindo offline depois do logout.
 */
const PRECACHE_PREFIX = 'workbox-precache';

export async function clearRuntimeCaches(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  try {
    const keys = await window.caches.keys();
    await Promise.all(
      keys.filter((k) => !k.startsWith(PRECACHE_PREFIX)).map((k) => window.caches.delete(k)),
    );
  } catch (err) {
    // Sem Cache Storage (modo privado, quota) — não pode travar o logout.
    console.warn('[pwa] limpeza de cache falhou', err);
  }
}
