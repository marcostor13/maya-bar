# Calendario y videollamadas (Google Meet / Microsoft Teams)

Una empresa puede conectar uno o varios calendarios en **Configuración → Calendario y videollamadas**. Desde Conversaciones se agendan llamadas que crean un evento real en ese calendario, con enlace de videollamada e invitación a los asistentes.

| Botón | Proveedor | Videollamada |
|---|---|---|
| **Conectar Google Calendar (Meet)** | OAuth de Google (Gmail o Google Workspace) | Google Meet |
| **Conectar Microsoft Teams** | OAuth de Microsoft (Microsoft 365) | Microsoft Teams |

- La primera conexión queda como **predeterminada**; se puede cambiar o desconectar desde la tarjeta.
- Conectar, cambiar la predeterminada y desconectar: `TENANT_ADMIN` y `MANAGER`. Ver conexiones: roles de CRM. Crear eventos: roles de CRM con el módulo **Conversaciones**.
- Los tokens se guardan cifrados (AES-256-GCM, misma clave que el correo) y nunca salen por la API. Se renuevan solos; si la renovación falla, la API pide volver a conectar el calendario.
- Microsoft Teams exige una cuenta de trabajo o escuela (Microsoft 365). Con cuentas personales de Outlook.com el evento se crea, pero puede quedar sin enlace de Teams.

## Configuración del servidor

Usa **las mismas apps de OAuth y variables que el correo** (ver [correo.md](correo.md)): `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `MICROSOFT_OAUTH_CLIENT_ID/SECRET`, `MICROSOFT_OAUTH_TENANT`, `PUBLIC_API_URL`, `FRONTEND_URL`, `EMAIL_ENCRYPTION_KEY`. Solo hay que añadir en cada app:

### Google

1. URI de redirección autorizada: `{PUBLIC_API_URL}/calendar/oauth/google/callback`.
2. Habilitar **Google Calendar API** en el proyecto.
3. Pantalla de consentimiento con el scope `https://www.googleapis.com/auth/calendar.events` (scope sensible: fuera de tu organización Google pide verificar la app).

### Microsoft

1. URI de redirección (Web): `{PUBLIC_API_URL}/calendar/oauth/microsoft/callback`.
2. Permisos delegados de Microsoft Graph: `Calendars.ReadWrite`, `User.Read` (más `offline_access`, `openid`, `email`, `profile`).

Sin credenciales, los botones aparecen deshabilitados con el aviso "Falta configurar credenciales OAuth en el servidor".

## API

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET /calendar/connections` | CRM | `{ available: { google, microsoft }, connections: [{ _id, provider, email, name, isDefault }] }` |
| `GET /calendar/oauth/:provider/start` | Admin | `{ url }` para iniciar OAuth (`provider` = `google` \| `microsoft`). |
| `GET /calendar/oauth/:provider/callback` | Público | Canjea el código y vuelve a `/settings?calendar=connected&email=…` o `?calendar=error&reason=…`. |
| `PATCH /calendar/connections/:id/default` | Admin | Marca la conexión como predeterminada. |
| `DELETE /calendar/connections/:id` | Admin | Desconecta; si era la predeterminada, pasa a la más antigua. |
| `POST /calendar/events` | CRM + Conversaciones | Crea la reunión (ver abajo). |

`POST /calendar/events`:

```json
{
  "title": "Demo con Acme",
  "description": "opcional",
  "start": "2026-10-01T15:00:00-05:00",
  "durationMinutes": 30,
  "attendees": ["cliente@acme.pe"],
  "connectionId": "opcional; sin él, la predeterminada",
  "timeZone": "America/Lima"
}
```

`durationMinutes` va de 5 a 480. Responde `{ provider, eventId, htmlLink?, joinUrl?, start, end, connectionEmail }`, con `start`/`end` en ISO UTC y `joinUrl` el enlace de Meet o Teams. Sin calendarios conectados responde 400 con un mensaje para conectarlo. Google envía la invitación a los asistentes (`sendUpdates=all`); Microsoft también la envía al crear el evento.
