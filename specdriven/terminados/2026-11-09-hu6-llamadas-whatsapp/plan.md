# HU6 — Llamadas de WhatsApp · Plan técnico

## Estado actual

- **Webhook:** `backend/src/conversations/whatsapp-webhook.controller.ts`.
  - `handleCloud` solo lee `messages` y `statuses`, y no valida la firma.
  - `main.ts` no activa `rawBody`.
- **Socket:** `conversations.gateway.ts`. `handleConnection` une a la sala
  `handshake.query.tenantId` sin comprobar la sesión. El cliente es
  `frontend/src/app/shared/conversations-realtime.ts`.
- **Push:**
  - web: `push/push.service.ts` `sendToTenant(tenantId, payload, {moduleKey})`,
    cuyas categorías están en `push-audience.service.ts`;
  - nativa: `notifications/push.service.ts` `sendToTenantModule`.
- **Permisos:**
  - backend: `roles/modules.catalog.ts` (`ALL_MODULES`,
    `RAW_DEFAULT_ROLE_MODULES`) y `ModuleGuard`;
  - frontend: `moduleGuard` y el `shell.ts` `navGroups`.
- **Bloqueos:** `BlockedContactsService.isBlocked(tenantId, 'whatsapp', contact)`.
- **Ficha:** el esquema `ContactActivity` ya tiene el tipo `call`. Los clientes
  se crean o recuperan con `LeadsService.upsertCustomer`.
- **Chat:** `ConversationsService` tiene `upsertConversation`, `systemNote` y
  `sendFromAgent`, los tres privados.
- **Meta:** `shared/meta-graph.client.ts` (`GRAPH_VERSION = 'v21.0'`) y
  `WhatsAppAccountsService.toConfig`.
- **Panel:** `dashboard-analytics.service.ts` (`kpis`) y
  `frontend/src/app/pages/dashboard/dashboard.ts` (`TILES`).

## Diseño

### Datos

- `calls` (`calls/call.schema.ts`):
  - campos: `tenantId`, `accountId`, `waCallId` (único), `direction`
    (`inbound`/`outbound`), `status`, `contact`, `contactName`,
    `customerId?`, `conversationId?`, `claimedBy?`, `answeredBy?`,
    `answeredByName?`, `startedAt`, `connectedAt?`, `endedAt?`,
    `durationSec?`, `endReason?`, `offerSdp?` (solo mientras suena),
    `logged` (bool, para la idempotencia del registro);
  - estados: `ringing | connecting | active | completed | missed | rejected |
    blocked | failed`;
  - índices: `{tenantId, startedAt:-1}` y `{waCallId:1}` único.
- `call_permissions` (`calls/call-permission.schema.ts`):
  - campos: `tenantId`, `accountId`, `contact`, `requestedAt?`,
    `response?` (`accept`/`reject`), `respondedAt?`, `expiresAt?`,
    `permanent?`;
  - índice único `{accountId, contact}`.
- `WhatsAppAccount`:
  - añade `calling` con `ringTimeoutSec` (30), `missedReplyEnabled` (false) y
    `missedReplyText`;
  - añade `waAppSecret?`, que no se devuelve nunca en la API (`select:false`).

### API

Todo con `JwtAuthGuard` + `ModuleGuard('calls')`:

- `GET /calls?status&direction&from&to&userId&accountId&page` → `{items,total}`
- `POST /calls/:id/claim` → `{offerSdp}`; 409 si ya no suena.
- `POST /calls/:id/release`: el micrófono falló y la llamada vuelve a sonar.
- `POST /calls/:id/accept {sdp}` → Meta `pre_accept` y `accept`.
- `POST /calls/:id/reject`
- `POST /calls/:id/hangup`
- `GET /calls/permission?accountId&contact` → `{status, expiresAt?, canRequest, canCall}`
- `POST /calls/permission/request {accountId, contact}`
- `POST /calls/outbound {accountId, contact, sdp}` → `{call}`
- `GET /calls/settings/:accountId` → `{meta, local}`, solo administrador.
- `PUT /calls/settings/:accountId {meta?, local?}`, solo administrador.
- `GET /calls/stats?from&to` → `{total, missed, avgDurationSec}`, que usa el panel.

### Socket

Emite estos eventos:
- a la sala `calls:<tenantId>`: `call:incoming {call}`, `call:taken {id, by}` y
  `call:ended {id, status}`;
- a la sala `user:<userId>`: `call:answer {id, sdp}` (saliente) y
  `call:updated {call}`.

### Interfaz

- **`CallsService`** (raíz): gestiona el estado de la llamada, WebRTC
  (`getUserMedia`, `RTCPeerConnection` y espera de ICE), silenciar, colgar y el
  cronómetro.
- **`CallOverlayComponent`**: va montado en el shell y muestra el aviso
  entrante o el panel de llamada.
- **Página `pages/calls/calls.ts`**: historial con filtros, paginación, estados
  vacío y error, y acciones.
- **`CallButtonComponent` + `CallDialogComponent`**: el diálogo muestra el
  estado del permiso, solicitar permiso y llamar.
- **Configuración:** sección "Llamadas" en `whatsapp-settings.ts`, en cada
  cuenta.
- **Panel:** 3 tiles con `module: 'calls'`.
- **Enlaces profundos:**
  - la ficha se abre con `/customers?view=<id>`, que se añade;
  - el chat se abre con `/inbox?c=<id>`, que ya existe.

### Integración Meta

- `CallsMetaService` se encarga de `settings`, `calls` (acciones y `connect`),
  `call_permissions` y el mensaje interactivo `call_permission_request`.
- Usa `MetaGraphClient` con un parámetro `version`. Los errores de Meta se
  traducen a `BadRequestException` con el mensaje de Meta.

## Seguridad

- **Webhooks falsos (llamadas fantasma o acceso a SDP):** firma HMAC con
  `timingSafeEqual` sobre el `rawBody`.
- **Espionaje de otra empresa por socket:** el JWT se verifica en el handshake
  con `ActiveUserCache`, y las salas se derivan del token.
- **IDOR en `/calls/:id`:** todas las consultas filtran por `tenantId` del
  token. Las salientes solo las controla quien las inició.
- **Carreras al aceptar:** `findOneAndUpdate({status:'ringing'})` atómico.
- **PII en logs:** se usa `maskPhone` y nunca se registra el SDP.
- **Secreto por cuenta:** `waAppSecret` lleva `select:false`.

## Observabilidad

- Se registra cada transición: `call <id> ringing→active`, con el teléfono
  enmascarado.
- Los errores de Meta se registran con su código, y el usuario ve el mensaje
  traducido.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Activar la firma rompe la entrada de mensajes si el secreto no coincide | Sin secreto se sigue como hoy. Con secreto, se registra una advertencia por cada firma inválida. Se documenta cómo comprobarlo. |
| Exigir JWT en el socket rompe clientes viejos (PWA en caché) | El cliente nuevo envía el token. El viejo deja de recibir tiempo real, pero el refresco cada 60 s lo cubre hasta recargar. |
| Versión de Graph incorrecta para la Calling API | Variable `META_CALLING_GRAPH_VERSION`. |
| WebRTC sin prueba real | Prueba manual del usuario (C2), con pasos en `docs/llamadas-whatsapp.md`. |
| Varias instancias del backend | La reserva atómica es en Mongo, el barrido de vencidas también, y los sockets son por sala. |

## Estrategia de pruebas

- **Unitarias de backend:**
  - firma;
  - parseo del webhook de llamadas;
  - `CallsService` (máquina de estados, reserva, tiempo de espera, bloqueado,
    registro idempotente);
  - `CallsMetaService` (forma de las peticiones);
  - gateway (autenticación y salas);
  - estadísticas.
- **e2e de API:**
  - webhook firmado entrante, con aviso por socket;
  - reserva doble (409);
  - perdida con respuesta automática;
  - bloqueado;
  - repetido;
  - firma inválida;
  - saliente;
  - aislamiento y 403.

  `MetaGraphClient` se simula con `jest.spyOn`.
- **Unitarias de frontend:** `CallsService` con WebRTC simulado, overlay,
  página, diálogo, configuración y tiles.
- **e2e de navegador:** historial (filtros) y aviso entrante (webhook firmado
  enviado desde la prueba, con `RTCPeerConnection` y `getUserMedia`
  simulados), aceptar y colgar.

## Fases

1. Seguridad base: firma de webhooks y socket con JWT. El producto sigue igual.
2. Backend de llamadas: esquemas, servicio, webhook, API y registro.
3. Frontend: overlay, historial, botón Llamar, configuración y panel.
4. Pruebas e2e, documentación para el usuario y verificación.

## ADRs

- `decisiones/0002-llamadas-webrtc-directo-a-meta.md`
