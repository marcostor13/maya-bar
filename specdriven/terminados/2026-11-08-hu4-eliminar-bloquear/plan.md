# HU4 — Eliminar conversaciones y bloquear contactos · Plan técnico

## Estado actual

- `backend/src/conversations/conversations.service.ts` `remove()`: borrado duro
  de conversación + mensajes, sin evento de tiempo real ni limpieza de
  programados/adjuntos/referencias.
- `setBlocked()` (mismo archivo): guarda `blocked*` en la conversación, bloquea
  en WhatsApp y añade a `suppression`. El descarte de entrantes mira
  `conv.blocked` después de `upsertConversation()`.
- `conversation.schema.ts`: índice único `{channel, accountId, contact}`.
- `conversations.controller.ts`: `@UseGuards(JwtAuthGuard, ModuleGuard('inbox'))`,
  `DELETE :id`, `PATCH :id/block`.
- `roles/modules.catalog.ts` + `role.schema.ts`: `actions` por módulo
  (create/edit/delete), ausencia = todas.
- Frontend `pages/inbox/inbox.ts` (lista, menú del chat, `toggleBlock`,
  `deleteConversation`), `shared/conversations-realtime.ts`,
  `auth/permissions.service.ts` (`canAct`).
- Otros consumidores de `Conversation`: asignación, dashboard, analítica,
  conversiones, recuperación.

## Diseño

### Datos
- `Conversation`: `inTrash: boolean` (default false), `trashedAt`, `trashedBy`,
  `trashedByName`.
  - Middleware del esquema en `find`, `findOne`, `countDocuments`, `updateOne`,
    `updateMany`, `findOneAndUpdate`, `distinct` y `aggregate`: añade
    `inTrash: {$ne: true}` salvo que la consulta ya mencione `inTrash` o lleve
    la opción `withTrashed`. Así todos los consumidores (paneles, recuperación…)
    ignoran la papelera sin tocarlos.
  - Índice único pasa a parcial `{inTrash: false}`. `onModuleInit`: rellena
    `inTrash:false` donde falte, elimina el índice viejo si no es parcial y
    llama a `createIndexes()`.
- `BlockedContact` (nueva, `conversations/blocked-contact.schema.ts`):
  `tenantId, channel, identifier, reason?, blockedBy?, blockedByName?,
  customerId?, conversationId?, accountId?, onChannel?, source:
  'inbox'|'manual'|'migration'`; índice único `{tenantId, channel, identifier}`.

### Servicios
- `BlockedContactsService` (`conversations/blocked-contacts.service.ts`):
  `blockKey(channel, contact)`, `isBlocked`, `block(entries)`, `unblock`,
  `list(q)`, `removeById`, `migrateLegacy()`. Sincroniza `conversation.blocked*`
  en todas las conversaciones del tenant con ese canal + contacto.
- `ConversationsService`:
  - `setBlocked(id, …, {allChannels, reason})` reescrito sobre el servicio
    nuevo; conserva WhatsApp + suppression.
  - `processInbound`: `isBlocked()` antes de `upsertConversation`.
  - `composeEmail`: rechaza destinatario bloqueado.
- `ConversationTrashService` (`conversations/conversation-trash.service.ts`):
  `canDelete(tenantId, role)`, `trash(ids, user)`, `list(tenantId)`,
  `restore(id, user)`, `purge(id)`, `empty(tenantId)`, `@Cron` horario
  `purgeExpired()`. Emite `conversation:removed` / `conversation:updated`.

### API (controlador `conversations`, rutas fijas antes de `:id`)
- `GET  /conversations/trash` · `POST /conversations/trash/:id/restore` ·
  `DELETE /conversations/trash/:id` · `DELETE /conversations/trash`
- `POST /conversations/bulk-delete` `{ids[], block?, reason?, allChannels?}`
- `DELETE /conversations/:id` → papelera (antes borrado duro).
- `GET /conversations/blocked?q=` · `POST /conversations/blocked`
  `{channel, contact, reason?}` · `DELETE /conversations/blocked/:id`
- `PATCH /conversations/:id/block` acepta `allChannels`.
- `GET /conversations/permissions` → `{canDelete}` para la interfaz.

### Interfaz
- Lista: botón "Seleccionar" → casillas, barra con "Eliminar (n)" y "Eliminar y
  bloquear". Solo si `canDelete`.
- Menú de cabecera: "Papelera" (si `canDelete`) y "Contactos bloqueados".
- `inbox-trash.ts` (drawer): lista, restaurar, borrar definitivo, vaciar.
- `inbox-blocked.ts` (drawer): búsqueda, alta manual, desbloquear.
- `block-dialog.ts` (modal): motivo, "bloquear en todos los canales del
  cliente" (si hay cliente vinculado) y, en modo "eliminar y bloquear", aviso de
  que también va a la papelera. Sustituye al confirm de `toggleBlock`.
- Realtime: `conversationRemoved$` en `conversations-realtime.ts`.

## Seguridad

- `tenantId` siempre del JWT; cada consulta lo incluye; ids validados con
  `Types.ObjectId.isValid` (404 si no).
- Eliminar/papelera exige `canDelete` en el servidor, además del `ModuleGuard`.
- DTOs con `class-validator` (`ArrayMaxSize(200)` en lote, `MaxLength` en motivo
  e identificador, `IsIn` en canal).
- Riesgo detectado fuera de alcance: el gateway une sockets a la sala por
  `tenantId` de la query sin validar el JWT. Se anota como pendiente.

## Observabilidad

Logs `Logger` con `tenant`, `conversation` y `user` (ids) en eliminar,
restaurar, purgar, bloquear y desbloquear; nunca contenido ni identificador.
Errores de WhatsApp → `channelError` en respuesta + toast.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Algún consumidor ve chats en la papelera | middleware del esquema + prueba que lo cubre |
| Cambio de índice único en producción | relleno previo + drop condicional + `createIndexes()`; idempotente |
| Borrar adjuntos compartidos | solo mensajes `direction: 'in'` |
| `actions.inbox` ausente = "todo" | regla explícita para borrar (solo admin por defecto) |

## Estrategia de pruebas

- Unitarias backend: middleware/papelera (`conversation-trash.service.spec.ts`),
  bloqueos (`blocked-contacts.service.spec.ts`), `conversations.block.spec.ts`
  adaptado, inbound descartado.
- e2e API (`backend/test`): papelera/restaurar/403/aislamiento; bloqueo que
  sobrevive al borrado.
- Unitarias frontend: drawers, diálogo de bloqueo, selección, realtime.
- e2e navegador: eliminar → papelera → restaurar; bloquear → desbloquear.

## Fases

1. Backend papelera + bloqueo (API usable, interfaz actual sigue funcionando).
2. Interfaz.
3. Pruebas e2e y verificación.

## ADRs

- `decisiones/0001-papelera-por-filtro-de-esquema.md`
