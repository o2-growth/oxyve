/**
 * Regras de cache em tempo de execução do service worker (Workbox).
 *
 * Fica fora do vite.config.ts para poder ser testado no Vitest. O Workbox
 * serializa cada `urlPattern` com toString(), então as funções daqui precisam
 * ser autocontidas (sem usar nada de fora do próprio corpo).
 *
 * Não há regra para /rest/v1/ nem /functions/v1/ de propósito: o Workbox indexa
 * o cache só pela URL, sem o header Authorization, e com rede lenta devolvia
 * dado de outro usuário ou de minutos atrás como se fosse atual. O React Query
 * já faz o cache em memória.
 */

// Nome novo de propósito: o cache antigo "images" guardava comprovantes do
// Storage (respostas opacas) e é apagado pelo push-handler.js no activate.
export const IMAGES_CACHE = 'images-v2';
export const FONTS_CACHE = 'fonts';

export const runtimeCaching = [
  // Imagens só da própria origem (ícones, logos). Comprovante do Storage e foto
  // do Google ficam fora: têm CPF/valores e a URL assinada muda a cada abertura.
  {
    urlPattern: ({ request, url }: { request: Request; url: URL }) =>
      request.destination === 'image' && url.origin === self.location.origin,
    handler: 'CacheFirst' as const,
    options: {
      cacheName: IMAGES_CACHE,
      expiration: {
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      },
      // Sem status 0: resposta opaca ocupa ~7 MB de quota cada no Chrome.
      cacheableResponse: { statuses: [200] },
    },
  },
  // Fonts.
  {
    urlPattern: ({ request }: { request: Request }) => request.destination === 'font',
    handler: 'CacheFirst' as const,
    options: {
      cacheName: FONTS_CACHE,
      expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
      cacheableResponse: { statuses: [0, 200] },
    },
  },
];
