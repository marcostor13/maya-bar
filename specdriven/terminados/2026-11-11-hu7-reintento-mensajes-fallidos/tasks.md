# HU7 — Reintento automático de mensajes de WhatsApp fallidos · Tareas

- [x] T1 — Código de Meta en el error de `postCloudApiMessage` → C13 · prueba: `whatsapp.service.spec.ts`
- [x] T2 — `message-retry.policy.ts` (temporal / espera) → C1, C2 · prueba: `message-retry.policy.spec.ts`
- [x] T3 — Campos `retryCount`, `retryAt`, `retryStopped` e índice parcial en `message.schema.ts` → C14 · prueba: build
- [x] T4 — `ConversationsService.redeliver` + `MessageRetryService` con cron y registro en el módulo → C3–C12 · prueba: `message-retry.service.spec.ts`
- [x] T5 — Verificación mecánica: backend build OK, 1503/1503 unitarias, lint 0 errores; frontend 727/727 unitarias, build OK
- [x] T6 — Verificación independiente (`spec-verifier`): 13 CUMPLE · 1 PARCIAL (C5, corregido) · C15 [usuario]
- [x] T7 — Archivar en `terminados/` y actualizar el índice
