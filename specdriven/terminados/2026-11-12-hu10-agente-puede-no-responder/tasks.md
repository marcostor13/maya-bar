# HU10 — El agente IA puede decidir no responder · Tareas

- [x] T1 — `generateAnswer`: `allowSilence`, sección de prompt, `parseSilenceToken`, `silent` → C1–C5 · prueba: `ai-agents.service.spec.ts` ("no responder (HU10)")
- [x] T2 — `testChat` muestra el silencio como anotación → C8 · prueba: `ai-agents.service.spec.ts` (testChat C8)
- [x] T3 — `Conversation.agentSilent` + `runAgent` (límites, nota, no enviar) → C6, C7 · prueba: `conversations.email.spec.ts` ("el agente decide no responder (HU10)")
- [x] T4 — Texto de la sección 8.4 del prompt de Sovereign (`prompt-sovereign-v2.2.md`, aplicar tras el deploy) → C9
- [x] T5 — Verificación mecánica: `npm run build` OK · `npm test` 1557/1557 (+1 tras ajuste del playground: ai-agents 61/61) · eslint `src/ai-agents src/conversations` sin incidencias · frontend `tsc` OK y specs de ai-agents 17/17
- [x] T6 — Verificación independiente: `spec-verifier` bloqueado por el modo automático (hook de context-mode); autoverificación por criterio en `cierre.md`
- [x] T7 — Archivada en `terminados/`
