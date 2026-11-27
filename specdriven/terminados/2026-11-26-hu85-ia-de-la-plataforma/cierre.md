# HU85 — IA de la plataforma gratis · Cierre

- **Cerrada:** 2026-11-26
- **Estado:** Terminada con pendientes del usuario
- **Verificación (spec-verifier):** 10 CUMPLE · 2 PARCIAL (C11 sin prueba backend, C13 sin indicaciones) corregidos · C13 [usuario] NO VERIFICADO
- **Commits:** sin commit

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Key cifrada, vista con `keyHint` | CUMPLE | `backend/src/ai/platform-ai/platform-ai.service.ts` (save/view); `platform-ai.service.spec.ts` |
| C2 | Solo SUPERADMIN | CUMPLE | `platform-ai.controller.ts`; spec del controlador en `platform-ai.service.spec.ts` |
| C3 | `chatMessages` usa la plataforma | CUMPLE | `ai.service.ts` `chatMessages`; `ai.service.platform.spec.ts` |
| C4 | `chat()` usa la plataforma | CUMPLE | `ai.service.ts` `chat`; `ai.service.platform.spec.ts` |
| C5 | Sin créditos, consumo con costo | CUMPLE | `ai.service.ts` `metered`; `ai-credits.service.ts` `record`; specs |
| C6 | Key propia o desactivada: flujo anterior (también en `chat()`) | CUMPLE | `ai.service.ts` `platformFor`/`tenantKeys`; `ai.service.platform.spec.ts` |
| C7 | 400 al activar incompleto | CUMPLE | `platform-ai.service.ts` `save` |
| C8 | Listar modelos y probar | CUMPLE | `platform-ai.service.ts` `listModels`/`test` |
| C9 | Caché 30 s | CUMPLE | `platform-ai.service.ts` `active` |
| C10 | Página `/admin/ai` | CUMPLE | `frontend/src/app/pages/admin/platform-ai.ts` + spec; `shell.ts`, `app.routes.ts` |
| C11 | Aviso en el agente | CUMPLE | `platform-ai-notice.ts` + spec; `ai-agents.service.ts` `platformAi` + spec |
| C12 | Recuperación sin créditos | CUMPLE | `recovery-analysis.service.ts`; `recovery-credits.spec.ts` |
| C13 | Configuración real en producción | NO VERIFICADO [usuario] | `docs/ia-de-la-plataforma.md` |

## Qué se implementó

- Colección `platform_ai_settings` (key cifrada con SecretBox), `PlatformAiService` y API `admin/platform-ai` (GET/PUT, models, test).
- `AiService` usa la cuenta de la plataforma para empresas sin key propia; 0 créditos y consumo con `platformAi: true`.
- Recuperación, prospección (`hasAnyKey` async) y `GET ai-agents/platform-ai`.
- Página "IA de la plataforma" en el menú del superadmin y aviso en Avanzado del agente.

## Lo que tiene que hacer el usuario

- Desplegar y configurar la cuenta: `docs/ia-de-la-plataforma.md`.

## Pruebas

- `cd backend && npm run build` → OK · `npm test` → 158 suites, 1846 pruebas OK
- `cd frontend && npx ng test frontend --watch=false` → 130 archivos, 1062 pruebas OK · `npm run build` → OK

## Pendientes, riesgos y notas

- Sin tope de gasto por empresa (fuera de alcance); vigilar el panel de costos.
- Cambiar `EMAIL_ENCRYPTION_KEY`/`JWT_SECRET` deja la key ilegible: la plataforma se desactiva sola (solo log).
- Fuera de alcance: voz, audios/imágenes y embeddings.
