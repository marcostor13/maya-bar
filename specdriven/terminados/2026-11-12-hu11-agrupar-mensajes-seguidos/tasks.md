# HU11 — Agrupar los mensajes seguidos del cliente · Tareas

Nota: las pruebas quedaron en `conversations.email.spec.ts` (bloque "agrupar
mensajes seguidos (HU11)") para reutilizar su arnés en memoria, en vez de un
archivo `conversations.agent-batch.spec.ts` aparte.

- [x] T1 — Esquemas: `Message.agentPending`, `Conversation.agentDueAt/agentLockUntil`, `AiAgent.replyDelaySeconds` + DTO → C8 · prueba: "AiAgent DTO — espera antes de responder"
- [x] T2 — `scheduleAgent` + `drainAgent` + `answerPending` (reclamo, rechequeo, pendientes, liberar, reprogramar) y `runAgent` con lista → C1–C6 · prueba: bloque HU11 (C1–C5) + suites existentes con `AGENT_REPLY_DEBOUNCE_MS=0`
- [x] T3 — Recuperación periódica (`@Interval(15000)` `recoverDueAgentReplies`) → C7 · prueba: C7
- [x] T4 — Campo "Espera antes de responder (segundos)" en Avanzado del editor del agente → C8 · prueba: `tsc` OK + specs de ai-agents 17/17
- [x] T5 — Verificación mecánica: backend `npm run build` OK · `npm test` 1565/1565 · eslint `src/conversations src/ai-agents` sin incidencias
- [x] T6 — Verificación independiente: `spec-verifier` bloqueado por el modo automático (hook de context-mode); autoverificación por criterio en `cierre.md`
- [x] T7 — Archivada en `terminados/`
