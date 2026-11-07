# HU1 — Agendamiento por calendario para agentes IA · Tareas

- [x] T1 — Scope `calendar.freebusy` en OAuth Google → C1 · prueba: calendar-oauth spec
- [x] T2 — `availability.ts` (zona horaria + huecos) → C3 · prueba: availability.spec.ts
- [x] T3 — `CalendarService.busy` (Google freeBusy / Microsoft calendarView) y `video` opcional en `createEvent` → C2, C10 · prueba: calendar.service.spec.ts
- [x] T4 — Campos de agenda en `AiAgent` + DTO + esquema `AgentBooking` → C9, C11
- [x] T5 — `CalendarToolSession` (consultar/agendar, recomprobación, idempotencia, simulación) → C5, C6, C8, C10 · prueba: calendar-tools.spec.ts
- [x] T6 — `generateAnswer`: herramientas compuestas, prompt de agenda, contexto, `bookings` → C4 · prueba: ai-agents spec
- [x] T7 — `runAgent`: contexto de conversación + nota interna por cita → C7 · prueba: conversations spec
- [x] T8 — Frontend: pestaña "Agenda" en el editor de agentes + aviso de reconexión en Configuración → C9
- [x] T9 — `docs/calendario-agentes.md` + `.env.example` → C13
- [x] T10 — Verificación mecánica (comandos de `config.md`) → C12
- [x] T11 — Verificación independiente (`spec-verifier`)
- [x] T12 — Archivar en `terminados/` y actualizar el índice
