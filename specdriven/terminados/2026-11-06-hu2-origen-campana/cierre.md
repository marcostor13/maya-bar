# HU2 — Origen de campaña de las conversaciones · Cierre

- **Cerrada:** 2026-11-06
- **Estado:** Terminada
- **Verificación (spec-verifier):** 9 CUMPLE, 1 PARCIAL (C7, corregido después), 0 NO CUMPLE
- **Commits:** ver `git log` (commit "HU2: origen de campaña en conversaciones y recuperación por campaña")

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Anuncio Click-to-WhatsApp → `campaign {kind:'ad'}` | CUMPLE | `campaign-attribution.ts` `campaignFromReferral`; `conversations.service.ts` `resolveCampaign` + prueba |
| C2 | Toques solo de envíos exitosos (WhatsApp, SMS, correo) | CUMPLE | `campaigns.service.ts` `send`, `campaign-sender.service.ts` + pruebas |
| C3 | Ventana de 30 días | CUMPLE | `campaign-attribution.service.ts` `lookup` + prueba 5 vs 40 días |
| C4 | Primer toque, no se reemplaza | CUMPLE | `upsertConversation` (`!existing.campaign`) + prueba |
| C5 | Filtro, etiqueta en lista y cabecera | CUMPLE | `listConversations`, `inbox-filters.ts`, `inbox.ts` + pruebas |
| C6 | `GET /conversations/campaigns` | CUMPLE | `conversations.controller.ts`, `listConversationCampaigns` + prueba |
| C7 | Recuperación por campaña | CUMPLE (tras corrección) | `recovery.service.ts` `campaignFilter`/`campaigns`, `GET /recovery/campaigns`, `recovery-analysis.service.ts`, `analyze-step.ts` + pruebas |
| C8 | Marcado de chats antiguos de anuncios al arrancar | CUMPLE | `ConversationsService.onModuleInit`; probado también contra Mongo en memoria |
| C9 | Filtro validado y aislado por empresa | CUMPLE | `parseCampaignFilter` (regex + ObjectId), `tenantId` del JWT en todas las consultas + prueba de inyección |
| C10 | Sin regresiones | CUMPLE | suites completas en verde |

## Qué se implementó

- Módulo `backend/src/campaign-attribution/`: colección `campaign_touches` (TTL 90 días), normalización de teléfono (últimos 9 dígitos) y correo, origen desde anuncio, validación del filtro y listado de campañas.
- `Conversation.campaign` (primer toque): anuncio de Meta o campaña de Maya recibida en los 30 días previos al primer mensaje del contacto. Solo se atribuye en mensajes entrantes.
- Registro de envíos exitosos en campañas de WhatsApp, SMS y correo.
- Bandeja: filtro "Campaña" en el panel, etiqueta de origen en la lista y en la cabecera del chat; `campaign=ad:<id>|campaign:<id>` en `GET /conversations`.
- Recuperación: campaña opcional al crear y reanalizar (400 si es inválida o no tiene chats de WhatsApp); el análisis filtra por ella; selector en el paso 1 del asistente.

## Correcciones tras la verificación

- **M1 (medio):** el asistente pedía las campañas a `/conversations/campaigns` (permiso de bandeja). Ahora usa `GET /recovery/campaigns` con el permiso de campañas.
- **B1 (bajo):** el marcado al arrancar dejaba el nombre vacío con titulares vacíos y fallaba con ids numéricos. Ahora recorta a 120 caracteres, usa "Anuncio <id>" y convierte el id a texto (comprobado en Mongo).

## Lo que tiene que hacer el usuario

Nada que configurar. Tras desplegar, las conversaciones de anuncios antiguas se marcan solas; las campañas de Maya se atribuyen solo a partir de los envíos hechos con esta versión.

## Pruebas

- `backend npm run build` → OK; ESLint sin errores en los módulos tocados
- `backend npm test` → 97 suites, 1335 pruebas OK
- `frontend npx ng test --watch=false` → 55 archivos, 616 pruebas OK (antes de la corrección M1; tras ella, las specs afectadas 6/6)
- `frontend npm run build` → OK (aviso de presupuesto CSS previo en `inbox.ts`)
- e2e (`npm run verify`) no ejecutado.

## Pendientes, riesgos y notas

- Para anuncios se muestra el titular del anuncio, no el nombre de la campaña de Meta Ads (fuera de alcance; requeriría la API de Marketing).
- Atribución por últimos 9 dígitos: puede cruzar números de distintos países con la misma terminación (supuesto aceptado).
- Una conversación antigua sin origen queda atribuida si el contacto escribe dentro de los 30 días posteriores a recibir una campaña, aunque no responda a ella.
- El marcado al arrancar recorre todas las empresas en cada arranque (idempotente).
