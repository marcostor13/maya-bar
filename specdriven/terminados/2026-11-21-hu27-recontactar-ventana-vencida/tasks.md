# HU27 — Volver a contactar cuando venció la ventana de 24 h · Tareas

- [x] T1 — Helpers `template-send.ts` + `wa-window.ts`; API HU13 los usa → C3, C4 · prueba: specs api-messages (66 verdes) + `conversation-templates.service.spec.ts`
- [x] T2 — `Message.template`, `windowStatus`, bloqueo de texto libre en `sendManual`/`retryMessage` → C1, C5 · prueba: `conversations.window.spec.ts`
- [x] T3 — `sendTemplateMessage`, `ConversationTemplatesService`, `deliver` de plantilla, agente → C3, C4, C6, C7 · prueba: `conversations.window.spec.ts`, `conversation-templates.service.spec.ts`
- [x] T4 — Rutas del controlador + DTO + e2e API → C1, C3, C4, C5, C8 · prueba: `test/inbox-template.e2e-spec.ts` (5 verdes)
- [x] T5 — Frontend: `wa-window.ts`, `wa-template-picker.ts`, integración en la bandeja → C2 · prueba: `wa-template-picker.spec.ts` (8 verdes)
- [x] T6 — Verificación mecánica (`npm run verify`)
- [x] T7 — Verificación independiente (`spec-verifier`)
- [x] T8 — Archivar en `terminados/` y actualizar el índice
