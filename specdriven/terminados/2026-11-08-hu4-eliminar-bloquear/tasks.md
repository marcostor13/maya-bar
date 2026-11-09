# HU4 — Eliminar conversaciones y bloquear contactos · Tareas

- [x] T1 — Esquema: `inTrash`/`trashed*`, middleware, índice parcial y migración del índice → C3, C5 · prueba: unitaria del filtro (`conversation.schema.spec.ts`) + e2e API
- [x] T2 — `BlockedContact` + `BlockedContactsService` (normalización, block/unblock, lista, alta manual, migración) → C11, C13, C17, C18 · prueba: `blocked-contacts.service.spec.ts`
- [x] T3 — `setBlocked` sobre el servicio nuevo (`allChannels`), descarte en `processInbound` antes del upsert, `composeEmail` bloqueado → C11, C12, C14, C15, C16 · prueba: `conversations.block.spec.ts`
- [x] T4 — `ConversationTrashService`: permiso, papelera, restaurar/unir, purga, vaciar, cron, eventos → C1, C2, C4–C10, C19 · prueba: `conversation-trash.service.spec.ts`
- [x] T5 — Controlador + DTOs (rutas fijas antes de `:id`), `permissions` → C9, C20 · prueba: e2e API
- [x] T6 — Frontend: realtime `conversation:removed`, permiso `canDelete`; matriz de roles con "Eliminar" de Bandeja apagado por defecto → C2, C9, C10 · prueba: unitaria del realtime y de la matriz (`roles-matrix.spec.ts`); el 403 y `canDelete` en e2e API
- [x] T7 — Frontend: selección múltiple + barra de acciones, diálogo de bloqueo, "Eliminar y bloquear" → C1, C13, C19, C22 · prueba: unitaria del diálogo y los drawers; la selección múltiple en la e2e de navegador (2 chats)
- [x] T8 — Frontend: drawer Papelera y drawer Contactos bloqueados → C4, C8, C16, C17, C22 · prueba: unitaria
- [x] T9 — e2e API y e2e navegador de los dos flujos → C3, C5, C9, C11, C20 · prueba: e2e
- [x] T10 — Verificación mecánica (`npm run verify`) → C23
- [x] T11 — Verificación independiente (`spec-verifier`)
- [x] T12 — Archivar en `terminados/` y actualizar el índice
