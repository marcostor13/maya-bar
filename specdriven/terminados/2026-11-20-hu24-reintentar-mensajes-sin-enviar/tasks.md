# HU24 — Reintentar mensajes que no se enviaron · Tareas

- [x] T1 — Backend: `clientId` idempotente y `POST …/retry` → C1, C2, C3 · prueba: `test/inbox-retry.e2e-spec.ts`
- [x] T2 — `OutboxService` (cola persistente, vaciado en orden, reintento) → C4, C5, C6 · prueba: `shared/outbox.spec.ts`
- [x] T3 — Bandeja: envío por la cola, estado "Sin conexión", Reintentar → C7 · prueba: revisión + `outbox.spec.ts`
- [x] T4 — Verificación mecánica (`npm run verify`) → C8
- [x] T5 — Verificación independiente (`spec-verifier`)
- [x] T6 — Archivar en `terminados/` y actualizar el índice
