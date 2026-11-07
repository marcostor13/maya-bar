# Agendamiento con agentes IA (Google Calendar / Outlook)

Los agentes IA pueden ofrecer horarios libres reales y agendar citas durante un
chat de WhatsApp, Instagram, Messenger o correo. El evento se crea en el Google
Calendar o el Outlook de la empresa, con Meet o Teams y la invitación al correo
del cliente si lo da. Cada cita queda como nota interna en la conversación.

## Qué tienes que hacer

### 1. Credenciales OAuth en el servidor (una sola vez)

Son las mismas apps que usa el correo. Si ya conectas Gmail u Outlook desde
Maya, solo revisa los pasos marcados con **(nuevo)**.

**Google** — [console.cloud.google.com](https://console.cloud.google.com)

1. Crea o elige un proyecto.
2. **APIs y servicios → Biblioteca**: habilita **Google Calendar API**.
3. **Pantalla de consentimiento de OAuth**: tipo *Externo*, con nombre de app,
   correo de soporte y dominio `mayacrm.site`. En **Permisos (scopes)** añade:
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/calendar.freebusy` **(nuevo)**
   - `openid`, `email`, `profile`
4. **Credenciales → Crear credenciales → ID de cliente de OAuth** (Aplicación
   web). En **URIs de redireccionamiento autorizados**:
   - `https://api.mayacrm.site/calendar/oauth/google/callback`
   - `https://api.mayacrm.site/email-accounts/oauth/gmail/callback` (correo)
5. Copia el ID y el secreto.
6. Mientras la app esté en modo *Prueba*, solo pueden conectar los correos que
   añadas como **usuarios de prueba**, y el permiso caduca a los 7 días. Para
   uso real: **Publicar la app** y pedir la **verificación** de Google
   (`calendar.events` es un permiso sensible; tarda unos días y piden video y
   política de privacidad).

**Microsoft (Outlook / Microsoft 365)** — [entra.microsoft.com](https://entra.microsoft.com)

1. **Aplicaciones → Registros de aplicaciones → Nuevo registro**. Tipos de
   cuenta: *Cualquier directorio organizativo y cuentas personales de Microsoft*.
2. **Autenticación → Agregar plataforma → Web**, URIs de redirección:
   - `https://api.mayacrm.site/calendar/oauth/microsoft/callback`
   - `https://api.mayacrm.site/email-accounts/oauth/outlook/callback` (correo)
3. **Permisos de API → Microsoft Graph → Permisos delegados**:
   `Calendars.ReadWrite`, `User.Read`, `offline_access`, `openid`, `email`,
   `profile`. (`Calendars.ReadWrite` ya permite leer la disponibilidad: no hay
   permiso nuevo.)
4. **Certificados y secretos → Nuevo secreto de cliente**: copia el **valor**
   (solo se ve una vez) y apunta su vencimiento para renovarlo.
5. Copia el **Id. de aplicación (cliente)**.

### 2. Variables en Coolify (backend)

| Variable | Valor |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | De Google |
| `MICROSOFT_OAUTH_CLIENT_ID` / `MICROSOFT_OAUTH_CLIENT_SECRET` | De Microsoft |
| `MICROSOFT_OAUTH_TENANT` | `common` |
| `PUBLIC_API_URL` | `https://api.mayacrm.site` (ya existe) |
| `FRONTEND_URL` | `https://mayacrm.site` (ya existe) |
| `EMAIL_ENCRYPTION_KEY` | Opcional. Si la cambias, hay que reconectar calendarios y buzones. |

Guarda y redespliega el backend.

### 3. Conectar el calendario (cada empresa)

1. **Configuración → Calendario y videollamadas → Conectar Google Calendar** o
   **Conectar Microsoft** (rol administrador o gerente).
2. Acepta los permisos. Debe aparecer la cuenta en la lista.
3. **Si ya tenías Google conectado antes de esta versión, vuelve a conectarlo**:
   la conexión antigua no tiene el permiso de disponibilidad y el agente
   respondería que un asesor confirmará la cita.

### 4. Activar la agenda en el agente

**Agentes IA → editar → Agenda**:

- **Agendar citas**: actívalo.
- **Calendario**: el predeterminado o uno concreto.
- **Duración**, **zona horaria** y **horario de atención** por día.
- **Antelación mínima** (p. ej. 2 h), **hasta cuántos días** se puede agendar y
  **margen entre citas**.
- **Videollamada** (Meet/Teams) y **título del evento**.
- **Indicaciones**: qué tipo de cita es y qué preguntar antes.

El proveedor de IA no puede ser **Gemini** (no ejecuta herramientas en Maya).
Recomendado: Claude, OpenAI o DeepSeek.

### 5. Probar

1. En **Probar** (playground) escribe "quiero agendar una demo". El agente
   consulta la disponibilidad **real** y ofrece horarios; al confirmar, la cita
   se **simula** (aparece "Cita (simulada, no se creó)") y no toca tu calendario.
2. Prueba real: escríbele al agente por WhatsApp desde otro número, agenda y
   comprueba que el evento aparece en el calendario, que llega la invitación
   (si diste correo) y que en la bandeja se ve la nota "… agendó una cita".

## Cómo funciona

- Herramientas del agente: `consultar_disponibilidad` (Google `freeBusy` /
  Microsoft `calendarView`) y `agendar_cita`.
- Antes de crear el evento se vuelve a leer el calendario: si el hueco se ocupó
  o queda fuera del horario, no se agenda y el agente ofrece alternativas.
- No se duplica la cita si el agente la repite en la misma conversación, y
  cada conversación puede tener como máximo 2 citas pendientes.
- El agente no reprograma ni cancela: para eso deriva a una persona (la cita se
  cambia en Google Calendar / Outlook).
- Con cuentas personales de Outlook que no admiten Teams, la cita se crea sin
  videollamada.

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| Botones de conectar deshabilitados | Faltan las variables OAuth en el servidor (paso 2). |
| `redirect_uri_mismatch` al conectar | La URI de redirección no coincide exactamente con la del paso 1. |
| El agente dice que un asesor confirmará la cita | No hay calendario conectado, la conexión caducó o es una conexión de Google anterior sin el permiso de disponibilidad: reconéctalo (paso 3). |
| "Acceso bloqueado: la app no está verificada" | App de Google en modo prueba sin ese usuario de prueba, o falta la verificación. |
| Google pide reconectar cada semana | La app de Google sigue en modo *Prueba*: publícala. |
| Horarios corridos una o varias horas | Zona horaria del agente incorrecta (pestaña Agenda). |
