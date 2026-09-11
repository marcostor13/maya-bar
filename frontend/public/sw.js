/* eslint-disable */
/**
 * Service worker de Maya CRM.
 *
 * Su único trabajo es recibir las notificaciones push del backend y abrir la
 * conversación correcta al tocarlas. NO cachea la aplicación: el frontend se
 * sirve con SSR y assets hasheados, así que un caché propio solo conseguiría
 * servir bundles viejos tras cada despliegue.
 *
 * Se registra desde `PushService` (src/app/shared/push.service.ts).
 */

const FALLBACK_ICON = '/icons/icon-192.png';
const BADGE_ICON = '/icons/badge-96.png';

self.addEventListener('install', () => {
  // Un SW nuevo entra en vigor sin esperar a que se cierren las pestañas: al
  // cambiar el manejo de push no queremos convivir con la versión anterior.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/** Lee el payload del push tolerando que llegue vacío o sin JSON. */
function readPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch (_) {
    return { body: event.data.text() };
  }
}

/**
 * ¿Está el usuario mirando ya esa conversación? Entonces la notificación se
 * muestra en silencio: el navegador obliga a mostrar algo por cada push, pero
 * no tiene sentido vibrar por un mensaje que se está leyendo en pantalla.
 */
function isAlreadyWatching(clients, conversationId) {
  if (!conversationId) return false;
  return clients.some(
    (client) =>
      client.visibilityState === 'visible' &&
      client.url.includes('/inbox') &&
      client.url.includes(conversationId),
  );
}

self.addEventListener('push', (event) => {
  const data = readPayload(event);
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const silent = isAlreadyWatching(clients, data.conversationId);
        for (const client of clients) {
          client.postMessage({ type: 'push', payload: data });
        }
        return self.registration.showNotification(data.title || 'Maya CRM', {
          body: data.body || '',
          icon: data.icon || FALLBACK_ICON,
          badge: BADGE_ICON,
          // El tag es la conversación: los mensajes seguidos de un mismo chat
          // reemplazan la notificación anterior en vez de apilarse.
          tag: data.tag || 'maya-notification',
          renotify: !silent,
          silent,
          timestamp: data.timestamp || Date.now(),
          requireInteraction: false,
          data: {
            url: data.url || '/inbox',
            conversationId: data.conversationId || null,
          },
          actions: data.url ? [{ action: 'open', title: 'Abrir chat' }] : [],
        });
      }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/inbox';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Si la app ya está abierta se reutiliza esa ventana: abrir una nueva
        // en una PWA instalada deja dos instancias de la misma pantalla.
        for (const client of clients) {
          if ('focus' in client) {
            client.postMessage({ type: 'navigate', url: target });
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});

/**
 * El navegador rota la suscripción por su cuenta (caduca o se renueva la clave).
 * Cuando ocurre, la nueva se manda al backend para no perder al dispositivo.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'resubscribe' });
        }
      }),
  );
});
