# HU4 — Eliminar conversaciones y bloquear contactos · Cierre

- **Cerrada:** 2026-11-08
- **Estado:** Terminada (con pendientes técnicos anotados abajo)
- **Verificación (spec-verifier):**
  - 1.ª vuelta: 18 CUMPLE · 4 PARCIAL · 1 NO VERIFICADO.
  - 2.ª vuelta: 20 CUMPLE · 3 PARCIAL (C10, C15, C20).
  - Después se corrigieron C10 y C15 (ver abajo). No hubo 3.ª vuelta.
  - C20 queda PARCIAL por el gateway, que es anterior a esta historia.
- **Commits:** sin commit

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md` · ADR: `../../decisiones/0001-papelera-por-filtro-de-esquema.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Eliminar en lote a la papelera | CUMPLE | `conversation-trash.service.ts` `trash`; `inbox.ts` `deletePicked`; e2e de navegador `inbox.e2e.ts` (2 chats) |
| C2 | Tiempo real al eliminar | CUMPLE | `conversations.gateway.ts` `emitRemoved`; `conversations-realtime.ts`; `push.service.spec.ts` |
| C3 | Oculto en bandeja, contadores y paneles | CUMPLE | Filtro del esquema (`conversation.schema.spec.ts`); `message.inTrash` en los paneles; e2e de API: no leídos y panel |
| C4 | Restaurar | CUMPLE | `restore`; e2e de API y de navegador |
| C5 | Chat nuevo mientras el viejo está en la papelera; unión al restaurar | CUMPLE | Índice parcial; e2e de API |
| C6 | Cancela los programados | CUMPLE | `trash` → `scheduledModel.updateMany` |
| C7 | Purga a los 30 días | CUMPLE | `purgeExpired` (cron cada hora, lotes de 100) |
| C8 | Borrado definitivo y vaciar | CUMPLE | `purge`, `empty`; `inbox-trash.ts` con ConfirmService |
| C9 | 403 sin permiso | CUMPLE | `assertCanDelete`; e2e de API |
| C10 | Rol con "Eliminar" puede | CUMPLE (tras la corrección) | `roles-matrix.ts` `implicitActions`; `@RouteAction('edit')` en desbloquear y cancelar programado; `module.guard.spec.ts`; e2e de API |
| C11 | El bloqueo sobrevive al borrado | CUMPLE | `ingest` → `isBlocked` antes de crear el chat; e2e de API |
| C12 | Lo que llega del bloqueado se descarta sin push, tiempo real ni agente | CUMPLE | Return temprano en `ingest`; `conversations.block.spec.ts` |
| C13 | Bloquear en todos los canales | CUMPLE | `blockTargets`; unitaria |
| C14 | No se le puede escribir | CUMPLE | `sendManual`, `composeEmail` |
| C15 | Fallo del proveedor de WhatsApp con su motivo | CUMPLE (tras la corrección) | Toast en el bloqueo individual y `channelErrors` en "Eliminar y bloquear" |
| C16 | Desbloquear | CUMPLE | `unblock`/`removeById`; e2e de navegador |
| C17 | Alta manual normalizada | CUMPLE | e2e: `999 777 666` → `51999777666` |
| C18 | Migración de los bloqueos antiguos | CUMPLE | `migrateLegacy` (idempotente) |
| C19 | Eliminar y bloquear | CUMPLE | `bulk-delete` con `block`; e2e de API |
| C20 | Aislamiento entre empresas | PARCIAL | La API responde 404 a otra empresa (e2e). El gateway de sockets no valida el JWT (anterior a esta historia) |
| C21 | Logs sin datos del contacto | CUMPLE | Logs solo con ids |
| C22 | Interfaz y accesibilidad | CUMPLE | Toasts, ConfirmService, lucide, `aria-*`, Escape, estados de carga, vacío y error |
| C23 | `npm run verify` | CUMPLE | Ver "Pruebas" |

## Qué se implementó

- **Papelera:**
  - Campos `inTrash` y `trashed*`. Un filtro del esquema la oculta en toda la plataforma.
  - El índice único de contacto pasa a ser parcial; la migración corre al arrancar.
  - Eliminar uno o varios, restaurar (uniendo con el chat nuevo si existe), borrar definitivo y vaciar.
  - Purga cada hora a los 30 días: mensajes, programados y adjuntos entrantes. En leads, actividades y citas se quita la referencia al chat, sin borrarlos.
- **Permiso de eliminar:**
  - Solo el administrador, o un rol con "Eliminar" de Bandeja marcado a propósito.
  - La matriz de roles lo muestra apagado por defecto.
  - Desbloquear y cancelar un programado cuentan como "Editar".
- **Bloqueos:**
  - Nueva colección `blocked_contacts`, con el canal y el identificador normalizado.
  - Lo que llega de un bloqueado se descarta antes de crear el chat.
  - Opción "todos los canales del cliente".
  - Pantalla Contactos bloqueados (menú ⋮ de la Bandeja) con alta manual y desbloqueo.
  - Los bloqueos antiguos se migran solos.
- **Interfaz:**
  - Selección múltiple y "Eliminar y bloquear".
  - Diálogo de bloqueo con motivo.
  - Paneles de Papelera y de Contactos bloqueados.
  - Evento de tiempo real `conversation:removed`.
- **API nueva:**
  - `GET /conversations/permissions`
  - `GET|DELETE /conversations/trash`
  - `POST /conversations/trash/:id/restore`
  - `DELETE /conversations/trash/:id`
  - `POST /conversations/bulk-delete`
  - `GET|POST /conversations/blocked`
  - `DELETE /conversations/blocked/:id`
  - `DELETE /conversations/:id` ahora manda el chat a la papelera.
- `playwright.config.ts`: puerto web configurable con `E2E_WEB_PORT` (por defecto 4300).

## Lo que tiene que hacer el usuario

- Nada obligatorio.
- Al desplegar, el backend migra solo el índice y los bloqueos antiguos.
- Para que un rol distinto del administrador pueda eliminar conversaciones, marcar "Eliminar" en Bandeja dentro de Usuarios → Roles.

## Pruebas

- `npm run verify` (antes de las dos últimas correcciones) → EXIT 0:
  - Lint y build del backend: OK
  - Unitarias del backend: 103 suites / 1400 pruebas
  - e2e de API: 57 pruebas
  - Unitarias del frontend: 62 archivos / 665 pruebas
  - Build del frontend: OK
  - e2e de navegador: 15/15
- Tras corregir permisos y `channelErrors`:
  - `npm test -- src/roles src/conversations` → 207/207
  - `npm run test:e2e -- test/inbox-trash.e2e-spec.ts` → 9/9
  - Lint y build del backend y del frontend → limpios
  - No se repitió `npm run verify` completo, por falta de memoria del equipo.

## Pendientes, riesgos y notas

- **Seguridad (anterior a HU4):**
  - El gateway de sockets mete al cliente en la sala de la empresa según el `tenantId` de la query, sin validar el JWT.
  - Cualquiera que conozca ese id recibe los eventos, incluido `conversation:removed`.
  - Conviene una historia propia.
- **Restaurar uniendo dos chats:**
  - No es atómico.
  - No recalcula `lastMessage*` ni `unreadCount` del chat activo.
  - Falla si ambos chats tienen una cita a la misma hora (índice único de `agent-booking`).
- **"Eliminar y bloquear":**
  - No es atómico: si un bloqueo falla con un error que no es 404, el lote se corta.
- **Purga y vaciado:**
  - La purga automática solo registra el total, no los ids.
  - `empty` no va por lotes.
  - Quedan referencias sueltas en `blocked_contacts`, `suppression` y `recovery-plan`.
- **Identificadores de WhatsApp:**
  - "999.888.777" se toma como BSUID por el punto.
  - Un BSUID y el teléfono del mismo contacto se bloquean por separado.
- **Instagram y Messenger:** piden el perfil al proveedor antes de descartar al bloqueado.
- **Pruebas que no se hicieron:**
  - No se probó en viewport móvil ni en la app Android.
  - La e2e de navegador no incluye el paso "mensaje descartado", que solo está en la e2e de API.
- **Estilos:** `inbox.ts` supera el presupuesto (27,78 kB frente a 24 kB). Es solo un aviso de build.
- **Matriz de roles:** un rol que ya tenía guardado "Eliminar" en Bandeja antes de HU4 conserva el permiso de eliminar conversaciones. Antes de HU4 cualquier rol CRM podía borrarlas de forma definitiva.
