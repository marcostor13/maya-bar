# HU85 — IA de la plataforma gratis · Tareas

Tareas pequeñas (≤ medio día), por orden de dependencia. Marcar `[x]` solo
con la prueba en verde.

- [x] T1 — Esquema, DTO y `PlatformAiService` (cifrado, caché, listar, probar) → C1, C7, C8, C9 · prueba: `platform-ai.service.spec`
- [x] T2 — `PlatformAiController` superadmin + registro en `AiModule` → C2 · prueba: `platform-ai.controller.spec`
- [x] T3 — `AiService` usa la plataforma; `metered` en modo plataforma; `hasAnyKey` async → C3, C4, C5, C6 · prueba: `ai.service.platform.spec`
- [x] T4 — `AiCreditsService.record` con `platform` y ledger `platformAi` → C5 · prueba: `ai-credits.service.spec`
- [x] T5 — Recuperación sin créditos con plataforma; `GET ai-agents/platform-ai` → C11, C12 · prueba: specs ampliadas
- [x] T6 — Página `/admin/ai`, ruta y menú → C10 · prueba: `platform-ai.spec.ts` (frontend)
- [x] T7 — Aviso en Avanzado del agente → C11 · prueba: spec frontend
- [x] T8 — Verificación mecánica (comandos de `config.md`)
- [x] T9 — Verificación independiente (`spec-verifier`)
- [x] T10 — Archivar en `terminados/` y actualizar el índice

Verificación mecánica (2026-11-26): backend `npm run build` OK, `npm test` 158 suites / 1844 pruebas OK;
frontend `npm run build` OK, `ng test` 1061/1062 en la corrida completa (falló por tiempo `events.spec.ts` C3,
ajena a HU85; corrida sola: 6/6 OK).

Tras el verificador (2026-11-26): `chat()` busca las keys de la empresa por `meter.tenantId`
(con key propia no se regala la plataforma), prueba backend de `platformAi`, indicaciones en
`docs/ia-de-la-plataforma.md`. Final: backend 158 suites / 1846 pruebas OK; frontend 130 archivos /
1062 pruebas OK; ambos builds OK. La prueba del controlador está en `platform-ai.service.spec.ts`.
