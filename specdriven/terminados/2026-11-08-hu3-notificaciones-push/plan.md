# HU3 — Notificaciones push en Android e iPhone · Plan técnico

## Estado actual

- Web Push: `backend/src/push/push.service.ts` (`sendToUser`, `sendToTenant`
  con filtro por rol guardado al suscribir, sin comprobar usuario activo),
  `push.controller.ts` (`public-key`, `status`, `subscribe`, `test`).
- FCM: `backend/src/notifications/push.service.ts` (`NativePushService`:
  `sendToUser(s)`, `sendToTenantModule` con usuarios activos),
  `notifications.controller.ts` (`DELETE /devices/:token` **sin comprobar dueño**).
- Llamadas: `conversations.service.ts` (`notifyInbound`, `notifyInboundNative`,
  derivación solo web), `forms.service.ts`, `leads.service.ts`,
  `lead-reminders.service.ts`, `recovery-worker.service.ts`.
- Frontend: `shared/push.service.ts` (web; `disable` no persiste),
  `shared/push-center.ts` (campana; en la app nativa sale "no soportado"),
  `core/push.service.ts` (FCM; toast siempre en primer plano),
  `pages/settings/notifications-settings.ts` (solo nativa),
  `shared/conversations-realtime.ts` (total sin leer), `public/sw.js`.

## Diseño

- **Datos**
  - `User.pushPrefs?: { chats, forms, leads, recovery, muted }` (booleanos,
    ausente = activo). Sin migración: ausente equivale a todo activo.
  - Sin cambios en `push_subscriptions` / `device_tokens` salvo usar
    `createdAt`/`lastSeenAt` existentes.
- **Audiencia** — `backend/src/push/push-audience.service.ts` (en `PushModule`,
  global): `forUsers(userIds, category?)` y `forModule(tenantId, moduleKey,
  category?, excludeUserId?)` → ids de usuarios activos, con el módulo en su rol
  (SUPERADMIN siempre) y la categoría permitida en `pushPrefs`. Mapa
  `MODULE_CATEGORY = { inbox: chats, forms, leads, campaigns: recovery }`.
- **Envío**: ambos servicios reciben `category` en el payload y resuelven
  destinatarios con la audiencia; nuevo `sendToUsers` en Web Push. Payload
  web añade `badge`; FCM añade `notificationCount`, `sound: 'default'` y
  `tag`. Conversaciones: helper común `inboundPush(conv, msg)` con título,
  extracto ≤ 100 (`…`), contador "N mensajes nuevos" (`unreadCount`), badge
  (`unreadTotal`), y derivación también por FCM.
- **API** (todas con `JwtAuthGuard`, sobre el usuario del token)
  - `GET /push/devices` → `[{ id, kind: 'web'|'android'|'ios', label, installed?, createdAt, lastSeenAt }]`.
  - `DELETE /push/devices/:kind/:id` → borra solo si es del usuario.
  - `GET /push/preferences` / `PUT /push/preferences` (DTO booleano validado).
  - `POST /push/subscribe` devuelve `{ id }`; `POST /devices` devuelve `{ ok, id }`.
  - `POST /push/test` envía por los dos canales.
  - `DELETE /devices/:token` filtra por `userId`.
- **Interfaz**
  - `notifications-settings.ts` visible siempre: estado del dispositivo
    (nativo o web) con los mismos estados que la campana, guía iOS/iOS viejo,
    instrucciones de permiso negado por plataforma, servidor sin configurar,
    prueba, lista de dispositivos con "Quitar" (ConfirmService) y preferencias
    (checkbox con label). Toasts en cada acción.
  - `push-center.ts`: en la app nativa usa `NativePushService`.
  - `shared/push.service.ts`: `optOut` en localStorage al desactivar (no se
    re-suscribe en `init`), se limpia al activar; guarda `deviceId` actual;
    `iosVersion()`.
  - `core/push.service.ts`: sin toast si se está viendo esa conversación;
    `optOut` igual; guarda `deviceId`; `serverEnabled` desde `/devices/status`.
  - `conversations-realtime.ts`: `navigator.setAppBadge(total)` / `clearAppBadge`.
  - `sw.js`: `setAppBadge(badge)`; silencio + `close()` si se está viendo.
- **Integraciones**: Web Push (VAPID) y FCM sin cambios de proveedor.

## Seguridad

- Se protege: dispositivos y preferencias de cada usuario. Amenaza: un usuario
  autenticado borrando o listando dispositivos ajenos → todas las consultas
  filtran por `userId` del JWT; `DELETE /devices/:token` corregido.
- Fuga de avisos entre empresas o a usuarios sin módulo → audiencia filtra por
  `tenantId`, `isActive` y módulo del rol actual (no el guardado al suscribir).
- La lista no devuelve `endpoint`, `p256dh`, `auth` ni `token`.

## Observabilidad

- Logs: número de envíos, borrados por caducidad y errores del proveedor con
  código, sin título ni cuerpo. Usuario: estados claros en Configuración.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| iOS revoca la suscripción si un push no muestra notificación | El SW siempre llama `showNotification` (silenciosa si se está viendo) |
| Cambiar constructores rompe specs | Se mantienen las firmas de `PushService`/`NativePushService`; solo se añade la audiencia |
| Badge no soportado en algunos navegadores | Se comprueba `'setAppBadge' in navigator` |

## Estrategia de pruebas

- Unitarias backend: audiencia (activo, módulo, prefs, exclusión, SUPERADMIN,
  fallo de base), Web Push `sendToUsers`/badge, FCM `notificationCount`, baja
  limitada al dueño, controller de dispositivos/preferencias/prueba, payload de
  conversaciones (extracto, contador, badge, derivación por FCM).
- Unitarias frontend: settings en cada estado, opt-out tras desactivar,
  supresión del toast nativo, badge en realtime.
- Manual **[usuario]**: Android con APK, iPhone con PWA.

## Fases

1. Backend: audiencia + preferencias + dispositivos + correcciones + payloads.
2. Frontend: settings unificada, campana nativa, opt-out, badge, SW.
3. Guía y verificación.

## ADRs

- No aplica: no hay cambio de proveedor ni de modelo de datos costoso de revertir.
