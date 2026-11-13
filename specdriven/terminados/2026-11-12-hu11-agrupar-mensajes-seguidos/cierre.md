# HU11 — Agrupar los mensajes seguidos del cliente y responder una sola vez · Cierre

- **Cerrada:** 2026-11-12
- **Estado:** Terminada con pendientes del usuario (prueba real en WhatsApp)
- **Verificación (spec-verifier):** no ejecutado: el modo automático bloqueó el lanzamiento (un hook de context-mode modifica la llamada). Autoverificación: 8 CUMPLE · 1 [usuario].
- **Commits:** sin commit

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Ráfaga de 3 → una respuesta con los 3 en orden | CUMPLE | `conversations.service.ts` `scheduleAgent`/`drainAgent`/`answerPending`; `conversations.email.spec.ts` "C1: una ráfaga…" |
| C2 | Cada mensaje reinicia la espera | CUMPLE | spec "C2: cada mensaje reinicia la espera" |
| C3 | Mensaje durante la generación: sin paralelo; segunda respuesta con la primera en el historial | CUMPLE | candado `agentLockUntil` + reprogramación en `finally`; spec "C3…" (`maxInFlight` 1) |
| C4 | `unsupported` solo no responde; se junta con el siguiente | CUMPLE | `ingest` (marca pendiente sin programar); spec "C4…" |
| C5 | Persona toma el chat durante la espera → no responde, descarta pendientes | CUMPLE | `answerPending` (rechequeo); spec "C5…" |
| C6 | Espera 0 = como hoy; espera por agente | CUMPLE | `agentDelayMs`; suites existentes con `AGENT_REPLY_DEBOUNCE_MS=0` en verde; C1–C5 usan `replyDelaySeconds: 6` |
| C7 | Reclamo atómico con caducidad; recuperación periódica | CUMPLE | `drainAgent` (`findOneAndUpdate`), `@Interval(15000) recoverDueAgentReplies`; spec "C7…" |
| C8 | Campo en el editor (0–30) y DTO valida rango | CUMPLE | `ai-agents.ts` (Avanzado → "Espera antes de responder"); `ai-agent.dto.ts` `@IsInt @Min(0) @Max(30)`; spec "AiAgent DTO…" |
| C9 | Prueba real en WhatsApp **[usuario]** | NO VERIFICADO | pendiente |

## Qué se implementó

- `Message.agentPending`, `Conversation.agentDueAt` / `agentLockUntil` (índices parciales), `AiAgent.replyDelaySeconds`.
- El agente espera (por defecto 6 s, `AGENT_REPLY_DEBOUNCE_MS` o la del agente), junta los pendientes en un solo turno y responde una vez; nunca dos respuestas en paralelo por conversación, también con varias instancias.
- Recuperación cada 15 s de esperas vencidas si la instancia que las programó cayó (sin "escribiendo…").
- Pendientes de más de 15 min se descartan.

## Lo que tiene que hacer el usuario

- Opcional: fijar `AGENT_REPLY_DEBOUNCE_MS` en Coolify si quiere otra espera global (por defecto 6000).
- Tras el deploy, enviar a un agente por WhatsApp 2–3 mensajes seguidos y comprobar que llega una sola respuesta unos segundos después del último.

## Pruebas

- `npm run verify` (2026-11-12) → todo OK (unitarias backend 1565/1565, e2e de API 81/81, unitarias y build frontend OK, e2e de navegador 22/22).
- `npx jest src/conversations/conversations.email.spec.ts` → 31/31.

## Pendientes, riesgos y notas

- Cada respuesta del agente llega ahora ~6 s más tarde (la espera); ajustable por agente.
- En la recuperación tras caída no se muestra "escribiendo…" (no hay configuración del canal).
- Sin verificación independiente (bloqueo del modo automático).
