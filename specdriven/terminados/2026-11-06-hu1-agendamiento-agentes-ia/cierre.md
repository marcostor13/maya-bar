# HU1 — Agendamiento por calendario para agentes IA · Cierre

- **Cerrada:** 2026-11-06
- **Estado:** Terminada con pendientes del usuario
- **Verificación (spec-verifier):** 12 CUMPLE, 1 PARCIAL (C7, corregido después), 1 NO VERIFICADO (C14 [usuario])
- **Commits:** ver `git log` (commit "HU1: agendamiento por calendario para agentes IA")

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Scope `calendar.freebusy` en Google | CUMPLE | `backend/src/calendar/calendar-oauth.service.ts`, `calendar-oauth.service.spec.ts` |
| C2 | Ocupado/libre Google y Microsoft | CUMPLE | `calendar.service.ts` (`busy`, `busyGoogle`, `busyMicrosoft`) + pruebas |
| C3 | Cálculo de huecos con zona horaria | CUMPLE | `backend/src/calendar/availability.ts` + 7 pruebas |
| C4 | Herramientas solo con agenda activa | CUMPLE | `ai-agents.service.ts` `generateAnswer` + 4 pruebas |
| C5 | Agenda libre / rechaza ocupado con alternativas | CUMPLE | `ai-agents/calendar/calendar-tools.ts` + pruebas |
| C6 | Sin duplicados | CUMPLE | reserva previa con índice único (`claim`) + pruebas de concurrencia y de liberación |
| C7 | Nota interna con la cita | CUMPLE (tras corrección) | `conversations.service.ts` `runAgent`: enlace de videollamada o del evento |
| C8 | Simulación en el playground | CUMPLE | `simulate` en `CalendarToolSession` y `testChat` |
| C9 | Pestaña "Agenda" en el editor | CUMPLE | `frontend/src/app/pages/ai-agents/agent-calendar-section.ts` + 6 pruebas |
| C10 | Errores claros sin inventar horarios | CUMPLE | `CalendarToolSession.run` + prueba |
| C11 | Aislamiento por empresa, sin tokens | CUMPLE | consultas con `tenantId`, `pick`/`findOne` por empresa |
| C12 | Sin regresiones | CUMPLE | suites completas en verde |
| C13 | Guía y `.env.example` | CUMPLE | `docs/calendario-agentes.md`, `backend/.env.example` |
| C14 | Credenciales y reconexión [usuario] | NO VERIFICADO | pendiente del usuario |

## Qué se implementó

- OAuth de Google con `calendar.freebusy`; Microsoft ya leía con `Calendars.ReadWrite`.
- `CalendarService.busy`: Google `freeBusy`, Microsoft `calendarView` (UTC, paginado), con reintento tras renovar el token y error que pide reconectar.
- `createEvent` con videollamada opcional y reintento sin Teams en cuentas que lo rechazan.
- `availability.ts`: horarios libres con zona horaria (incluye cambios de horario), horario semanal, margen, antelación y días máximos.
- Herramientas del agente `consultar_disponibilidad` y `agendar_cita`: vuelven a comprobar el hueco, ofrecen alternativas, reservan antes de crear (sin duplicados ni en concurrencia), máximo 2 citas pendientes por conversación y simulación en el playground.
- Colección `agent_bookings` (pendiente → confirmada).
- Configuración de agenda por agente (subdocumento `calendar`) y pestaña "Agenda" en el editor.
- Nota interna en la conversación por cada cita.
- Documentación: `docs/calendario-agentes.md`, `docs/calendario.md`, `backend/.env.example`.

## Lo que tiene que hacer el usuario

Seguir [docs/calendario-agentes.md](../../../docs/calendario-agentes.md):
1. Google Cloud: Calendar API, scopes (`calendar.freebusy` nuevo), URI de redirección; publicar o verificar la app.
2. Microsoft Entra: URI de redirección y permisos de Graph.
3. Variables OAuth en Coolify (backend) y redesplegar.
4. Reconectar Google en Configuración → Calendario.
5. Activar "Agenda" en el agente (proveedor distinto de Gemini) y probar.

## Pruebas

- `backend npm run build` → OK
- `backend npm test` → 95 suites, 1314 pruebas OK (verificador); tras las correcciones, `src/ai-agents src/conversations src/calendar` → 197/197
- `frontend npx ng test --watch=false` → 610/610 (2 fallos por tiempo agotado en `leads` y `campaign-editor` en una corrida; pasan al repetir, no relacionados)
- `frontend npm run build` → OK (aviso de presupuesto CSS previo en `inbox.ts`)
- e2e (`npm run verify`) no ejecutado; sin prueba contra Google/Microsoft reales.

## Pendientes, riesgos y notas

- Con proveedor `auto` y solo clave de Gemini, el agente no puede usar las herramientas (el prompt le indica no inventar horarios).
- `calendarView` lee como máximo 500 eventos por consulta.
- El agente no reprograma ni cancela citas (fuera de alcance): deriva a una persona.
- El id de calendario del agente se valida contra la empresa al usarlo, no al guardar.
