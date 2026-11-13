# HU11 — Agrupar los mensajes seguidos del cliente · Plan técnico

## Estado actual

- `conversations.service.ts` `ingest` (~l. 1742): guarda el entrante,
  interpreta el adjunto y, si procede, llama a `runAgent(conv, msg, …)` (~l. 1864)
  por cada mensaje. `unsupported` sale antes sin respuesta.
- `runAgent` (~l. 1910) arma historial (`buildAiHistory`, excluye el actual) y
  llama a `generateAnswer`; "escribiendo…" con `typing` (solo Messenger).
- Reclamo atómico con `findOneAndUpdate` ya usado en HU7
  (`message-retry.service.ts`); `@nestjs/schedule` disponible.

## Diseño

- **Datos**
  - `Message.agentPending?: boolean` (+ índice parcial
    `{conversationId:1}` con `agentPending: true`).
  - `Conversation.agentDueAt?: Date` (vence la espera) y
    `Conversation.agentLockUntil?: Date` (candado con caducidad).
  - `AiAgent.replyDelaySeconds?: number` (0–30; vacío = global).
- **Flujo** (`ingest` → `scheduleAgent` → `drainAgent`):
  1. En `ingest`, tras los filtros de hoy, el entrante se marca
     `agentPending`. Si es texto vacío o `unsupported`, se queda ahí (R4).
  2. `scheduleAgent`: resuelve el agente (sin agente → log y salir, como hoy),
     `delay = replyDelaySeconds*1000 ?? AGENT_REPLY_DEBOUNCE_MS`,
     `$set agentDueAt = now+delay`, guarda en memoria `{resolveAgent, typing}`
     por conversación y reprograma un `setTimeout(delay)` propio (cancela el
     anterior). Con delay 0 llama a `drainAgent` y lo espera.
  3. `drainAgent(convId)`: reclamo
     `findOneAndUpdate({_id, agentDueAt ≤ now, agentLockUntil ausente o < now},
     {$set: agentLockUntil now+90s, $unset: agentDueAt})`. Si `null`, sale.
     Rechequea autoReply/estado/bloqueo/no contactar (R5) → si falla,
     `$unset agentPending` de sus pendientes. Lee pendientes (orden `at`,
     últimos 15 min; los más viejos se desmarcan), llama a `runAgent(conv,
     pendientes, …)`, desmarca esos ids y libera el candado. En `finally`, si
     `agentDueAt` volvió a quedar puesto (llegó algo durante la generación),
     programa otro `drainAgent` para cuando venza (R3).
  4. `runAgent` recibe la lista: `userMessage` = contenidos unidos con `\n`;
     historial excluye todos los pendientes.
- **Recuperación** (R7): `@Interval(15000)` busca conversaciones con
  `agentDueAt < now−10s` (máx. 20) y llama a `drainAgent` con `resolveAgent`
  reconstruido por canal y cuenta (`findPublishedBy…`), sin `typing`.
- **API**: `replyDelaySeconds` en `CreateAiAgentDto`/`UpdateAiAgentDto`
  (`@IsInt @Min(0) @Max(30) @IsOptional`).
- **Interfaz**: campo numérico en el editor del agente (sección de respuesta).

## Seguridad

Sin endpoints nuevos salvo un campo validado en el DTO del agente (rango).
Aislamiento por tenant: todo se resuelve desde la conversación. Candado con
caducidad para no bloquear un chat.

## Observabilidad

Log al responder una ráfaga: `Agente responde N mensajes en <convId>`; log en
la recuperación con el número de conversaciones atendidas. Sin texto del
cliente.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Respuestas dobles con varias instancias | Reclamo atómico + caducidad |
| Chat que se queda sin respuesta (instancia caída) | Recuperación cada 15 s |
| Pruebas existentes que esperan respuesta inmediata | Espera 0 en el arnés de pruebas (`AGENT_REPLY_DEBOUNCE_MS=0` o agente con 0) |
| Respuesta tardía a un pendiente viejo | Se descartan los de más de 15 min |

## Estrategia de pruebas

- Unitarias en `conversations.agent-batch.spec.ts` con el arnés en memoria
  (C1–C7) y temporizadores falsos de Jest; DTO (C8).
- Suites existentes en verde (C6).
- Manual: C9 **[usuario]**.

## Fases

1. Backend completo + pruebas (deja el producto funcionando con la espera por
   defecto).
2. Campo en el editor del agente.
