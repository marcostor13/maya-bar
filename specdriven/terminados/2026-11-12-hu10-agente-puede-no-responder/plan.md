# HU10 — El agente IA puede decidir no responder · Plan técnico

## Estado actual

- `backend/src/ai-agents/ai-agents.service.ts` `generateAnswer`: respuesta vacía → `fallbackMessage`; `{{HANDOFF}}` se extrae con `parseHandoffToken`.
- `backend/src/conversations/conversations.service.ts` `runAgent` (~1910): siempre envía `reply` o `handoffMessage`; apaga "escribiendo…" en `finally`.

## Diseño

- **Datos:** `Conversation.agentSilent: boolean` (default false).
- **IA:** `AgentAnswerOptions.allowSilence`; sección de prompt `--- NO RESPONDER ---` cuando es true; `parseSilenceToken` elimina siempre la marca; `generateAnswer` devuelve `silent: { reason } | null`.
- **runAgent:** `allowSilence = history.some(assistant) && !conv.agentSilent`. Si `silent`: nota interna, `agentSilent = true`, nada se envía. Si envía: `agentSilent = false`.
- **Playground:** `testChat` permite callar (mismos límites; un turno vacío del agente = silencio anterior, no se manda a la IA) y devuelve `silent: { reason }`; la interfaz lo pinta como anotación.
- **Interfaz:** bandeja sin cambios (la nota interna ya se pinta); playground: anotación "No respondería" y sin burbuja vacía (`ai-agents.ts`).

## Seguridad

La marca se limpia siempre; un cliente que la escriba no la controla (el texto
del cliente no se interpreta). Límites R6 evitan dejar sin respuesta a un
contacto nuevo o un hilo entero.

## Observabilidad

Log `Agente <id> no respondió en <conv>: <motivo>` y nota interna en el hilo.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| El agente calla de más | Límites R6 y nota visible para el equipo |
| La marca llega al cliente | Se elimina siempre, también sin permiso |

## Estrategia de pruebas

- Unitarias de `generateAnswer`, `testChat` y `runAgent` (C1–C8). Manual: C9.

## Fases

1. Backend completo + pruebas.
2. Prompt de Sovereign preparado (`prompt-sovereign-v2.2.md`), a aplicar tras el deploy.
