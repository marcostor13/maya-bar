# Correo electrónico

Los buzones de correo funcionan como un canal más de Conversaciones: los correos llegan en vivo a la bandeja (pestaña **Correos**), los agentes de IA pueden responderlos y cualquier persona del equipo puede contestar o escribir un correo nuevo.

## Conectar un buzón (Configuración → Correo electrónico)

| Opción | Cómo se conecta | Recepción |
|---|---|---|
| **Conectar Gmail** | OAuth de Google (sin contraseñas) | IMAP con IDLE: en vivo |
| **Conectar Outlook** | OAuth de Microsoft (Outlook.com y Microsoft 365) | IMAP con IDLE: en vivo |
| **Otro servidor** | Usuario y contraseña, con plantillas para Gmail, Outlook, Yahoo, iCloud, Zoho, Hostinger y GoDaddy | IMAP (en vivo) o POP3 (cada 2 minutos) |

Todo sale por SMTP. Al guardar un buzón manual se prueba la conexión de entrada y de salida antes de guardarlo. Las contraseñas y los tokens se guardan cifrados (AES-256-GCM) y nunca se devuelven por la API.

La primera vez que se conecta un buzón no se importa el histórico: solo entra lo que llegue desde ese momento.

## Variables de entorno del backend

| Variable | Para qué |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Botón "Conectar Gmail". |
| `MICROSOFT_OAUTH_CLIENT_ID` / `MICROSOFT_OAUTH_CLIENT_SECRET` | Botón "Conectar Outlook". |
| `MICROSOFT_OAUTH_TENANT` | Opcional; `common` por defecto (cuentas personales y de empresa). |
| `PUBLIC_API_URL`, `FRONTEND_URL` | Ya existen; arman el callback de OAuth y la vuelta a Configuración. |
| `EMAIL_ENCRYPTION_KEY` | Opcional; clave para cifrar credenciales. Sin ella se usa `JWT_SECRET`. **Si cambia, hay que reconectar los buzones.** |
| `EMAIL_TLS_REJECT_UNAUTHORIZED=false` | Opcional; acepta servidores con certificado autofirmado. |
| `EMAIL_LISTENER_ENABLED=false` | Opcional; apaga la escucha en esa instancia. |

Sin credenciales de OAuth, los botones de Gmail y Outlook aparecen deshabilitados, pero se puede conectar cualquier buzón con "Otro servidor".

Las mismas apps de OAuth sirven para conectar calendarios (Google Meet / Microsoft Teams): ver [calendario.md](calendario.md) para las URIs de redirección y los scopes adicionales.

### Google (Gmail)

1. Google Cloud Console → APIs y servicios → Credenciales → **ID de cliente de OAuth** (aplicación web).
2. URI de redirección autorizada: `{PUBLIC_API_URL}/email-accounts/oauth/gmail/callback`.
3. Pantalla de consentimiento con el scope `https://mail.google.com/`. Es un scope restringido: para usuarios fuera de tu organización, Google exige verificar la app. Con Google Workspace y la app en modo **Interna** no hace falta.

### Microsoft (Outlook / Microsoft 365)

1. Azure Portal → Microsoft Entra ID → Registros de aplicaciones → **Nuevo registro** (cuentas de cualquier organización y cuentas personales).
2. URI de redirección (Web): `{PUBLIC_API_URL}/email-accounts/oauth/outlook/callback`.
3. Permisos delegados: `IMAP.AccessAsUser.All`, `SMTP.Send` (Office 365 Exchange Online), `offline_access`, `openid`, `email`, `profile`.
4. Crear un secreto de cliente. En Microsoft 365 el administrador debe tener habilitados IMAP y SMTP autenticado para el buzón.

## Agentes de IA

En Agentes IA → Canales se eligen los buzones que responde cada agente. Al contestar por correo el agente:

- recibe el asunto y el contenido de los adjuntos (PDF, imágenes…);
- escribe con formato de correo, y la plataforma añade asunto (`Re:`), firma e hilo (`In-Reply-To` / `References`);
- nunca contesta boletines, rebotes, remitentes `no-reply` ni respuestas automáticas;
- marca sus correos con `Auto-Submitted: auto-replied`, y si responde más de 5 correos en una hora dentro de un mismo hilo se pausa y deja una nota: así se cortan los bucles con otros contestadores.

## Varias réplicas del backend

Cada buzón lo escucha una sola instancia, con un arriendo en Mongo que se renueva cada minuto. Si esa instancia cae, otra toma el buzón en menos de tres minutos y retoma desde el último correo procesado.
