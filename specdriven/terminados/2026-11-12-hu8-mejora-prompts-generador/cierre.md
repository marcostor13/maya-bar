# HU8 — Mejora de prompts y generador de agentes IA · Cierre

- **Cerrada:** 2026-11-12
- **Estado:** Terminada (pendiente prueba real del usuario, C14)
- **Verificación (spec-verifier):** 1.ª vuelta 12 CUMPLE · 1 PARCIAL (C13) · 1 [usuario]; 2.ª vuelta 13 CUMPLE · 1 NO VERIFICADO [usuario]
- **Commits:** ver `git log` de la rama `develop` ("HU8: …")

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Selección de conversaciones (tenant, agente, periodo, prioridad, máx. 30) | CUMPLE | `prompt-review.service.ts` `pickConversations`; `prompt-review.service.spec.ts` C1 |
| C2 | Validación de la salida de la IA | CUMPLE | `prompt-review.logic.ts` `sanitizeSuggestions`; `prompt-review.logic.spec.ts` |
| C3 | Sin conversaciones → 400 sin llamar a la IA | CUMPLE | `prompt-review.service.spec.ts` C3 |
| C4 | Aplicar: cambio atómico + versión + `applied` | CUMPLE | `replacePrompt` en `ai-agents.service.ts`; spec C4 |
| C5 | Texto ya no está → 409 | CUMPLE | `applyChange` + spec C5 |
| C6 | Descartar | CUMPLE | spec C6 |
| C7 | Versión en edición manual | CUMPLE | `ai-agents.service.spec.ts` "historial del prompt" |
| C8 | Restaurar versión | CUMPLE | spec C8 |
| C9 | Generador devuelve borrador sin crear | CUMPLE | `agent-generator.service.ts`; spec C9 |
| C10 | Aislamiento por tenant | CUMPLE | `findOne(id, tenantId)` en cada método; `ParseObjectIdPipe`; specs C10 |
| C11 | Teléfonos y correos ocultos | CUMPLE | `redact` (transcripciones, evidencia, resumen) |
| C12 | Interfaz: mejorar y generar | CUMPLE | `agent-improve.ts`, `agent-generator.ts` + specs |
| C13 | Error accionable si la IA falla | CUMPLE (tras corrección) | `call-ai.ts`; specs |
| C14 | Prueba real | NO VERIFICADO [usuario] | — |

## Qué se implementó

- Backend (`backend/src/ai-agents/insights/`): colecciones `agentpromptversions` y `agentpromptreviews`; lógica pura (ocultar datos, transcripciones con tope, validar y aplicar cambios); `PromptReviewService` (analizar, aplicar, descartar, versiones, restaurar); `AgentGeneratorService`; `callAi` (errores claros); controlador con JWT + módulo + roles y tope de 20 llamadas/h por IP en análisis y generador.
- `AiAgentsService.update` guarda la versión anterior al editar el prompt; `replacePrompt` cambia el prompt solo si nadie lo editó entre medio.
- Frontend: `/ai-agents/:id/mejoras` (diagnóstico, sugerencias con antes/después y enlace a la conversación, aplicar/descartar con confirmación, historial y restaurar) y `/ai-agents/generar` (formulario → borrador editable → agente en borrador, sin derivación activa); botones "Mejorar" y "Generar con IA"; `?edit=` abre el agente creado.

Correcciones tras el verificador: error claro si la IA tarda o falla por red; tope de llamadas; sugerencias sin evidencia se descartan; aplicar no reescribe el espaciado del resto del prompt; el resumen también oculta datos; el generador no activa la derivación sin destinatarios; toasts al fallar la carga.

## Lo que tiene que hacer el usuario

- C14: en Agentes IA → "Mejorar" de un agente con conversaciones, analizar, revisar y aplicar alguna sugerencia; y probar "Generar con IA". Usa las API keys de IA de la empresa (o las de la plataforma si no tiene). No requiere configuración externa.

## Pruebas

- `backend: npm run build` → OK · `npm test` → 114 suites, 1544/1544 · `eslint src/**/*.ts` → 0 errores
- `frontend: npx ng test frontend --watch=false` → 72 archivos, 743/743 · `npm run build` → OK
- e2e: no aplica (depende de un proveedor de IA real).

## Pendientes, riesgos y notas

- La prioridad de "clientes que abandonan" solo cubre los que quedaron esperando respuesta; los que dejaron de escribir tras responder el agente no suben de prioridad (los ve igual el analizador).
- Aplicar no es atómico entre cambiar el prompt y marcar la sugerencia: si lo segundo falla, una sugerencia `add` podría aplicarse dos veces (riesgo bajo).
- El tope de llamadas es por IP, no por empresa.
- Sin prueba de `?edit=` en `ai-agents.ts`. Prueba inestable ajena: `dashboard.spec.ts:74` y `leads.spec.ts` hacen timeout bajo carga.
