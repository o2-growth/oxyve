// Sprint 7 — DEC-011: handlers de push + notificationclick.
//
// Este arquivo é injetado no Service Worker do vite-plugin-pwa via
// `workbox.importScripts`. Roda no contexto do SW (não do client).
//
// Payload esperado (JSON enviado pelo send-push edge fn):
//   { title, body, link?, tag?, data? }
//
// Em notificationclick, abre o link (ou /app/dashboard) e tenta focar
// uma janela existente do app antes de abrir uma nova.

self.addEventListener('push', (event) => {
  if (!event || !event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch (err) {
    // Push sem JSON válido — ignora silencioso.
    return;
  }

  const title = data.title || 'Oxy VE';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'oxyve-default',
    data: {
      link: data.link || '/app/dashboard',
      ...(data.data || {}),
    },
    // requireInteraction = false (default) — desaparece automático no desktop.
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/app/dashboard';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Foca uma janela existente do mesmo origin se houver.
      for (const client of allClients) {
        try {
          const url = new URL(client.url);
          if (url.origin === self.location.origin) {
            await client.focus();
            // Navega pra rota destino (post-message permite SPA pegar via listener).
            if ('navigate' in client) {
              return client.navigate(link);
            }
            return;
          }
        } catch (err) {
          // continua tentando próximos
        }
      }

      // Nenhuma janela aberta: abre nova.
      if (self.clients.openWindow) {
        return self.clients.openWindow(link);
      }
    })(),
  );
});
