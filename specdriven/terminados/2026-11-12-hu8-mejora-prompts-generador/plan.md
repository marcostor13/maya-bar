# HU8 — Mejora de prompts y generador de agentes IA · Plan técnico

## Estado actual

- Agentes: `backend/src/ai-agents/` (CRUD en `ai-agents.service.ts:179-260`,
  `update` con `$set` del DTO). No hay historial del prompt.
- IA: `AiService.chatMessages` (`backend/src/ai/ai.service.ts:135`) con keys
  del tenant (`AiAgentsService.getTenantApiKeys`), `timeoutMs` y
  `AiService.parseJson` (`ai.service.ts:176`).
- Conversaciones: `conversation.agentId` lo fija `runAgent`
  (`conversations.service.ts:1947`); `escalated`, `lastMessageDirection`,
  `inTrash`. Mensajes: `message.schema.ts` (`author`, `text`, `transcript`).
- Interfaz: `frontend/src/app/pages/ai-agents/ai-agents.ts` (lista + drawer).

## Diseño

- **Datos** (colecciones nuevas, sin migración):
  - `agentpromptversions`: `tenantId, agentId, prompt, source
    ('manual'|'suggestion'|'restore'), note?, createdBy?, createdAt`. Índice
    `{agentId:1, createdAt:-1}`. Guarda el texto **anterior** a cada cambio.
  - `agentpromptreviews`: `tenantId, agentId, days, conversationsAnalyzed,
    summary, suggestions[{title, problem, evidence[{conversationId, excerpt}],
    action, find?, text?, status}], createdBy, createdAt`. Índice
    `{agentId:1, createdAt:-1}`.
- **Lógica pura** `ai-agents/insights/prompt-review.logic.ts`: `redact`,
  `buildTranscripts` (límite de caracteres), `sanitizeSuggestions` (valida y
  recorta la salida de la IA), `applyChange` (devuelve el nuevo prompt o
  `null` si el `find` no está).
- **Servicios**: `PromptVersionsService` (registrar/listar/restaurar),
  `PromptReviewService` (analizar, aplicar, descartar, listar),
  `AgentGeneratorService` (borrador). `AiAgentsService.update` registra la
  versión anterior cuando cambia `systemPrompt`.
- **API** (controlador `AgentInsightsController`, mismos guards que
  `/ai-agents`):
  - `POST /ai-agents/generate` → borrador (no guarda).
  - `GET|POST /ai-agents/:id/reviews` (body `{days}`),
    `GET /ai-agents/:id/reviews/:reviewId`,
    `POST /ai-agents/:id/reviews/:reviewId/suggestions/:index/apply|discard`.
  - `GET /ai-agents/:id/versions`, `POST /ai-agents/:id/versions/:vid/restore`.
- **Interfaz**: páginas `pages/ai-agents/agent-improve.ts`
  (`/ai-agents/:id/mejoras`) y `pages/ai-agents/agent-generator.ts`
  (`/ai-agents/generar`); botones en la lista. El generador crea el agente con
  `POST /ai-agents` (`published:false`) y vuelve a la lista con el agente
  abierto para editar (`?edit=<id>`).
- **Integraciones**: proveedor de IA del agente; tope 110 s.

## Seguridad

Aislamiento por `tenantId` del JWT en cada consulta; ids validados
(`Types.ObjectId.isValid`). Las conversaciones son entrada no confiable: el
prompt del analizador las marca como datos y prohíbe obedecerlas; la salida
pasa por `sanitizeSuggestions` (acción en lista blanca, longitudes ≤ 4000,
≤ 10 sugerencias, `find` debe existir en el prompt, evidencia solo con ids de
las conversaciones enviadas). Ningún cambio sin clic del usuario + confirmación.

## Observabilidad

Log con `agentId`, número de conversaciones y duración; errores de la IA con
mensaje accionable (toast). Sin texto de conversaciones en los logs.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| La IA devuelve JSON cortado | `maxTokens` 4000, `parseJson` y error claro |
| El prompt cambió entre análisis y aplicación | `find` se busca en el prompt actual → 409 |
| Prompts largos (40 KB) + conversaciones superan el contexto | Tope de 60 000 caracteres de transcripciones; mensajes largos recortados |
| Sugerencias `add` se apilan al final sin orden | Se añaden al final con una línea en blanco; el usuario puede editar después |

## Estrategia de pruebas

- Unitarias backend: lógica pura, servicios (mocks de modelos y `AiService`),
  versionado en `AiAgentsService.update`.
- Unitarias frontend: las dos páginas (HttpTestingController, Toast/Confirm
  simulados).
- e2e: no aplica (depende de un proveedor de IA real; el stub no genera JSON).
- Manual: C14 **[usuario]**.

## Fases

1. Backend completo (versiones, análisis, generador) con pruebas.
2. Interfaz (mejoras + generador) con pruebas.

## ADRs

- No aplica: colecciones nuevas y aditivas, sin cambio de proveedor.
