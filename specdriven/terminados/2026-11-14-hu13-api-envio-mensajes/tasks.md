# HU13 — API de envío de mensajes · Tareas

- [x] T1 — Esquemas `ApiAccess`, `ApiUsage`; campos API en `Message`; permiso `integrations` → C1, C2 · prueba: unitarias
- [x] T2 — `ApiAccessService` (crear, listar, editar, revocar, regenerar, autenticar, origen/IP, cuotas) + spec → C1, C2, C4, C9, C13
- [x] T3 — `sendCloudApiTemplate` devuelve wamid; `ConversationsService.sendExternal` → C3, C7
- [x] T4 — `ApiMessagesService` (validaciones, idempotencia, estado) + spec → C5–C8, C10, C11, C14, C15
- [x] T5 — Controladores admin y público, `ApiKeyGuard`, módulo y registro → C3, C4
- [x] T6 — e2e de API → C1, C3, C4, C9, C10, C11
- [x] T7 — Frontend: página Integraciones, ruta, menú → C12
- [x] T8 — Bandeja: etiqueta "API · nombre" → C16 · prueba: e2e de navegador
- [x] T9 — e2e de navegador → C12
- [x] T10 — ADR 0004
- [x] T11 — Verificación mecánica (`npm run verify` + `tsc --noEmit` del backend)
- [x] T12 — Verificación independiente (`spec-verifier`)
- [x] T13 — Archivar
