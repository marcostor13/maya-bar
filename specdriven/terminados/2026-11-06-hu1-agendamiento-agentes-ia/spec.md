# HU1 — Agendamiento por calendario para agentes IA · Especificación

Historia: `specdriven/backlog/hu1.md` · Fecha: 2026-11-06 · Estado: aprobada (decisiones por defecto)

## Objetivo

Que un agente IA pueda ofrecer horarios libres y agendar citas reales en el
Google Calendar o el Outlook (Microsoft 365) de la empresa durante una
conversación de WhatsApp, Instagram, Messenger o correo, y que la empresa sepa
cómo vincular esas cuentas.

## Usuarios

- **Administrador de la empresa**: vincula Google Calendar u Outlook y
  configura el agendamiento del agente (horario, duración, calendario).
- **Cliente final**: pide una cita por chat y recibe fecha, hora y enlace.
- **Equipo de ventas**: ve en la bandeja que el agente agendó una cita.

## Alcance

- Incluye: consulta de disponibilidad real (ocupado/libre) en Google y
  Microsoft; herramientas del agente para ofrecer horarios y agendar;
  configuración por agente; aviso en la conversación; prueba en el playground
  sin crear eventos; guía para el usuario; variables de entorno documentadas.
- **Fuera de alcance:** reprogramar o cancelar citas desde el chat; página de
  calendario dentro de Maya (la agenda vive en Google/Outlook); calendarios por
  vendedor (las conexiones siguen siendo de la empresa); recordatorios
  automáticos al cliente; herramientas en el proveedor Gemini (no soporta
  herramientas en esta plataforma).

## Requisitos (EARS)

Funcionales:
- **R1** — Cuando un administrador conecta Google Calendar, el sistema debe
  pedir permiso para crear eventos **y** consultar ocupado/libre.
- **R2** — Cuando un administrador conecta Outlook / Microsoft 365, el sistema
  debe poder leer la agenda (ocupado/libre) y crear eventos con la misma
  conexión.
- **R3** — Cuando el agendamiento está activo en un agente y hay un calendario
  conectado, el agente debe disponer de las herramientas
  `consultar_disponibilidad` y `agendar_cita`.
- **R4** — Cuando el agente consulta disponibilidad, el sistema debe devolver
  solo horarios dentro del horario de atención configurado, en la zona horaria
  del agente, con la antelación mínima y el máximo de días configurados, sin
  solaparse con eventos ocupados del calendario (más el margen entre citas).
- **R5** — Cuando el agente agenda una cita, el sistema debe volver a comprobar
  que el horario sigue libre y dentro de las reglas, crear el evento en el
  calendario (con Meet o Teams si está activado y el cliente como invitado si
  dio correo) y devolver fecha, hora local y enlace.
- **R6** — Si el horario ya no está libre o viola las reglas, entonces el
  sistema no debe crear el evento y debe devolver al agente alternativas.
- **R7** — Cuando el agente agenda una cita en una conversación, el sistema
  debe dejar una nota interna visible para el equipo con los datos de la cita.
- **R8** — Si el agente intenta agendar dos veces la misma cita en la misma
  conversación, entonces el sistema no debe duplicar el evento.
- **R9** — Mientras se prueba el agente en el playground, el sistema debe
  simular el agendamiento sin crear eventos reales (la disponibilidad sí es real).
- **R10** — Cuando el administrador edita un agente, el sistema debe permitir
  activar el agendamiento y configurar calendario, duración, zona horaria,
  horario semanal, margen, antelación mínima, días máximos, videollamada e
  instrucciones.
- **R11** — Si el calendario no está conectado, caducó o el proveedor falla,
  entonces el agente debe recibir un error claro (no inventar horarios) y el
  administrador ver qué reconectar.

No funcionales:
- **R12** — Seguridad: tokens cifrados y nunca en respuestas ni logs; la
  conexión usada debe ser de la misma empresa que el agente; argumentos de las
  herramientas validados (fechas, correo, longitud).
- **R13** — Los cambios no deben romper el agendado manual de la bandeja
  ("Agendar llamada") ni las herramientas de tienda.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | Dado Google, cuando se genera la URL de OAuth, entonces incluye `calendar.events` y `calendar.freebusy` | unitaria |
| C2 | R2, R4 | Dado un token, cuando se consulta ocupado/libre, entonces se llama a `freeBusy` (Google) o `calendarView` (Microsoft) y se normalizan los intervalos | unitaria |
| C3 | R4 | Dado un horario L-V 9-18 en America/Lima, eventos ocupados, margen y antelación, cuando se calculan huecos, entonces ninguno cae fuera de horario, en el pasado cercano o solapado | unitaria (función pura) |
| C4 | R3 | Dado un agente con agendamiento activo, cuando responde, entonces el modelo recibe las dos herramientas (también sin tienda); sin agendamiento no las recibe | unitaria |
| C5 | R5, R6 | Dado un hueco libre, cuando se agenda, entonces se crea el evento con invitado y videollamada; dado uno ocupado o fuera de reglas, entonces no se crea y se devuelven alternativas | unitaria |
| C6 | R8 | Dada una cita ya agendada en la conversación para ese inicio, cuando se repite, entonces devuelve la existente sin crear otra | unitaria |
| C7 | R7 | Dado un agendamiento desde un chat, entonces aparece una nota interna con fecha, hora y enlace | unitaria |
| C8 | R9 | Dado el playground, cuando el agente agenda, entonces no se llama a crear evento y la respuesta indica que es simulado | unitaria |
| C9 | R10 | Dado el editor de agentes, entonces existe la sección "Agenda" con todos los campos y se guardan | build + unitaria frontend |
| C10 | R11 | Dado un calendario sin conexión o con error, cuando el agente consulta, entonces recibe `error` legible y no horarios | unitaria |
| C11 | R12 | Las consultas de reservas filtran por `tenantId`; la conexión elegida se valida contra la empresa; no hay tokens en respuestas | revisión + unitaria |
| C12 | R13 | Las pruebas existentes de calendario, agentes y tienda siguen pasando | suite completa |
| C13 | — | Existe `docs/calendario-agentes.md` con lo que debe configurar el usuario (Google Cloud, Azure, variables, reconexión) y `.env.example` documenta las variables | revisión |
| C14 | R1, R2 | Credenciales OAuth de Google y Microsoft cargadas en producción y calendario reconectado con los nuevos permisos **[usuario]** | manual |

## Supuestos y decisiones por defecto

- Las conexiones siguen siendo de la empresa (ya existe así); cada agente usa
  la predeterminada o una elegida.
- Zona horaria por agente (por defecto `America/Lima`); no existe una zona de
  empresa.
- Huecos cada 30 min (o cada duración si es menor); se ofrecen como máximo 8.
- Google: se añade el scope mínimo `calendar.freebusy` → las conexiones
  existentes deben reconectarse para que el agente lea disponibilidad.
- Microsoft: `Calendars.ReadWrite` ya permite leer; se usa `calendarView`
  (sirve también para cuentas personales, a diferencia de `getSchedule`).
- Con cuentas personales de Microsoft no se fuerza Teams si el proveedor lo
  rechaza: el evento se crea sin videollamada.
- Registro de citas en una colección propia (`agent_bookings`) para
  idempotencia y trazabilidad; la agenda real es la del proveedor.

## Preguntas abiertas

- Ninguna bloqueante.
