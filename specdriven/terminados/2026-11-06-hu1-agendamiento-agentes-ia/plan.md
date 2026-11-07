# HU1 — Agendamiento por calendario para agentes IA · Plan técnico

## Estado actual

- `backend/src/calendar/`: conexiones por empresa (Google/Microsoft) con OAuth,
  tokens cifrados (`SecretBox`), refresco y `createEvent` (Meet/Teams). No lee
  disponibilidad. Scope Google solo `calendar.events`.
- `backend/src/ai-agents/ai-agents.service.ts:491` `generateAnswer`: solo pasa
  herramientas si hay tienda (`StoreToolSession`). No recibe contexto de la
  conversación.
- `backend/src/conversations/conversations.service.ts` `runAgent`: envía
  respuesta, archivos y derivación.
- Frontend: `pages/ai-agents/ai-agents.ts` (secciones con pestañas),
  `pages/settings/calendar-settings.ts` (conectar calendarios).
- Sin zona horaria de empresa. Gemini no usa herramientas.

## Diseño

- **Datos**
  - `AiAgent`: `calendarEnabled`, `calendarConnectionId?`,
    `calendarDurationMinutes` (30), `calendarTimezone` ('America/Lima'),
    `calendarHours: {day,start,end}[]` (L-V 09:00-18:00),
    `calendarBufferMinutes` (0), `calendarMinNoticeHours` (2),
    `calendarMaxDaysAhead` (30), `calendarVideo` (true),
    `calendarTitle` ('Cita'), `calendarInstructions?`.
  - Nueva colección `AgentBooking`: tenantId, agentId, conversationId,
    connectionId, provider, eventId, start, end, title, attendeeEmail,
    contactName, joinUrl, htmlLink, status. Índice único
    `{conversationId, start}` para idempotencia.
- **Calendario**
  - `availability.ts` (puro): conversión de zona con `Intl` y cálculo de huecos.
  - `CalendarService.busy(tenantId, connectionId?, from, to)`: Google
    `POST /calendar/v3/freeBusy`; Microsoft `GET /me/calendarView` (paginado,
    descarta `showAs` free). Reintento con refresh ante 401.
  - `CalendarService.createEvent`: opción `video` (false = sin Meet/Teams);
    `connectionId` validado contra la empresa (ya lo hace `findOne`).
  - OAuth Google: añadir `calendar.freebusy`.
- **Agente**
  - `calendar-tools.ts` → `CalendarToolSession` (como `StoreToolSession`):
    `consultar_disponibilidad({desde?, hasta?})` y
    `agendar_cita({inicio, nombre, correo?, motivo?})`. Valida argumentos,
    recomprueba disponibilidad, crea evento + `AgentBooking`, idempotente.
    Modo `simulate` para el playground.
  - `generateAnswer`: compone herramientas de tienda + agenda; sección de
    prompt con fecha/hora actual en la zona del agente y reglas; recibe
    `context {conversationId, contactName, contactEmail}`; devuelve `bookings`.
  - `runAgent`: pasa el contexto y escribe una nota interna por cita.
- **Interfaz**: pestaña "Agenda" en el editor del agente (activar, calendario,
  duración, zona, horario por día, margen, antelación, días, videollamada,
  título, instrucciones; aviso si no hay calendario o si el proveedor es Gemini).
  En Configuración → Calendario, nota de reconexión para leer disponibilidad.

## Seguridad

- `tenantId` del agente/token; conexión validada por empresa; tokens nunca
  salen del servicio; argumentos del modelo validados (ISO, rango, email,
  longitudes) porque el texto del cliente puede inducir llamadas (*prompt
  injection*): solo puede agendar dentro de las reglas del agente.

## Observabilidad

- Logs de errores del proveedor sin tokens; el agente recibe errores legibles;
  nota interna en el chat por cada cita.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Conexiones Google antiguas sin `freebusy` | error claro "reconecta" + guía + aviso en Configuración |
| Microsoft personal rechaza Teams | reintento sin videollamada |
| Doble reserva por carrera | recomprobación antes de crear + índice único por conversación/inicio |
| Errores de zona horaria | función pura con pruebas incluyendo DST |

## Estrategia de pruebas

- Unitarias: `availability.spec.ts`, `calendar.service.spec.ts` (busy),
  `calendar-tools.spec.ts`, `ai-agents` (herramientas compuestas).
- Suites completas backend/frontend + builds. Prueba real con cuenta: manual
  del usuario (C14).

## Fases

1. Backend calendario (busy, scope, video opcional) + disponibilidad.
2. Herramientas del agente + integración con conversaciones.
3. Interfaz + documentación.
