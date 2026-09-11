# Configurar Messenger como canal del agente de IA

Guía para conectar páginas de Facebook (Messenger) al canal de IA de MAYA Platform. Usa **Facebook Login** + la **Messenger Platform** de Meta: el dueño autoriza una vez y la plataforma obtiene un *Page Access Token* por cada página. Se soportan **N páginas por tenant**, cada negocio conecta la suya con un click (OAuth), sin pegar tokens a mano.

---

## Parte A — Configuración única de la plataforma (una sola vez, la hace el admin de MAYA)

### A.1. Agregar el producto Messenger a la app de Meta

1. Entra a [developers.facebook.com/apps](https://developers.facebook.com/apps) y abre la app que ya usas para WhatsApp/Instagram (o crea una nueva de tipo **"Empresa"**).
2. Agrega los productos **"Messenger"** y **"Facebook Login"**.

### A.2. Configurar el redirect URI de OAuth

En **Facebook Login → Settings → Valid OAuth Redirect URIs**, agrega exactamente:

```
{PUBLIC_API_URL}/messenger-accounts/oauth/callback
```

(reemplaza `{PUBLIC_API_URL}` por la URL pública real del backend, ej. `https://api.mayacrm.site`).

### A.3. Configurar el webhook (uno solo para toda la app)

Meta permite **una única URL de webhook por app** — no una distinta por página conectada. Todas las páginas de todos los tenants comparten esta misma URL; el backend distingue la cuenta usando el `entry[].id` (Page ID) que Meta manda en cada evento.

1. App Dashboard → producto **Messenger** → **Webhooks**.
2. **Callback URL**: `{PUBLIC_API_URL}/messenger/webhook`
3. **Verify Token**: cualquier string secreto (ej. `maya-ms-2026-xyz`) — debe coincidir con la variable de entorno del paso A.4.
4. Suscribite a los campos **`messages`**, **`messaging_postbacks`**, **`message_echoes`** y **`messaging_seen`**.

### A.4. Variables de entorno del backend

```env
FACEBOOK_APP_ID=<App ID de developers.facebook.com>
FACEBOOK_APP_SECRET=<App Secret>
MESSENGER_VERIFY_TOKEN=<el mismo string del paso A.3>
```

`FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` son las mismas que usa la conexión de WhatsApp Cloud API — si ya están, no hay que tocarlas. `PUBLIC_API_URL` y `FRONTEND_URL` también deberían estar configuradas (se reutilizan para armar el redirect URI y para volver a la app tras conectar).

### A.5. Permisos y modo de la app

Se solicitan automáticamente al conectar cada página (Parte B):

- `pages_show_list`
- `pages_messaging`
- `pages_manage_metadata`
- `pages_read_engagement`

Mientras la app esté en modo **Desarrollo**, solo pueden conectarse páginas cuyos administradores tengan un rol en el dashboard de la app. Para producción con páginas de clientes hay que enviar la app a **App Review** solicitando `pages_messaging` con "Advanced Access" — Meta pide un video demo del flujo de mensajería.

---

## Parte B — Conectar una página (self-service, cada negocio/tenant)

1. En MAYA: **Configuración → Messenger**.
2. Click en **"Conectar con Facebook"**.
3. Se abre la pantalla de autorización de Facebook — el dueño se loguea y **elige qué páginas** dar de alta (Meta muestra el selector de páginas).
4. Vuelve automáticamente a MAYA con una cuenta creada por cada página autorizada, el token guardado y el webhook suscripto — no hay que copiar ni pegar nada.
5. Se puede repetir el proceso para agregar más páginas; las ya conectadas se actualizan en vez de duplicarse.

### Sobre los tokens

El token de usuario se extiende a uno de larga duración (~60 días) y de ahí se derivan los *Page Access Tokens*, que **no caducan** mientras el administrador no revoque el permiso ni cambie su contraseña. Si Meta revoca el acceso, el estado de la cuenta pasa a "Desconectado" (botón ↻ de verificar estado) y basta con volver a pulsar **"Conectar con Facebook"** para renovarlo.

### Vía manual (avanzado / legacy)

Si preferís generar el token vos mismo desde Graph API Explorer en vez de usar el botón de conectar, existe **"Añadir manualmente"** en la misma pantalla, pidiendo Page ID + Page Access Token. Tras guardar, usa el botón de enlace (🔗) en la cuenta para suscribirla al webhook — sin esto, Meta no envía los mensajes entrantes.

---

## Parte C — Vincular el agente de IA al canal

1. En **Agentes IA**, edita el agente que va a responder por Messenger.
2. Pestaña **Canales** → sección **Messenger** → marca la(s) página(s) por las que debe responder.
3. Activa **Publicado** y guarda.

Un agente puede atender WhatsApp, Instagram y Messenger a la vez: las tres listas de cuentas son independientes y comparten el mismo prompt, la misma base de conocimiento (RAG) y la misma configuración de derivación a un humano.

## Parte D — Probar

- Desde una cuenta personal de Facebook, envía un mensaje a la página conectada.
- MAYA recibe el evento por el webhook único, identifica la página y el tenant, genera la respuesta con IA y contesta.
- El chat aparece en la **Bandeja de entrada** con el ícono de Messenger, y se puede tomar manualmente como cualquier otro.
- Restricción de Meta: solo se puede responder dentro de las **24 horas** posteriores al último mensaje del usuario (ventana de mensajería estándar).

---

## Parte E — Pasar a producción (modo Live)

Igual que con Instagram, mientras la app esté en **Desarrollo** solo pueden conectarse páginas administradas por personas con rol en la app. Para que cualquier negocio conecte la suya:

### E.1. Completar la configuración básica de la app

En App Dashboard → **Settings → Basic**: App Icon (1024×1024), Privacy Policy URL, Terms of Service URL, categoría y la URL/instrucciones de **Data Deletion**.

### E.2. Generar evidencia de uso real

Meta exige al menos **una llamada exitosa a la API con cada permiso solicitado** dentro de los 30 días previos al envío — conectar tu propia página de prueba (Parte D) ya lo cubre.

### E.3. Solicitar Advanced Access

App Dashboard → **App Review → Permissions and Features** → **"Request Advanced Access"** para:
- `pages_show_list`
- `pages_messaging`
- `pages_manage_metadata`
- `pages_read_engagement`

Para cada uno, Meta pide una descripción del caso de uso (agente de atención al cliente con IA que responde mensajes de Messenger para negocios) y un **video demo** del flujo completo: conectar, autorizar, volver a MAYA y ver un mensaje respondido automáticamente.

### E.4. Business Verification

Para mensajería, Meta suele exigir verificar la identidad del negocio en **Meta Business Manager**. Se puede completar en paralelo al App Review.

### E.5. Activar modo Live

Con los permisos aprobados, cambiá el switch **Development / Live** arriba del App Dashboard.

---

## Notas y limitaciones

- El identificador del cliente en Messenger es el **PSID** (Page-Scoped ID): es distinto por página y no es el ID de Facebook del usuario. No hay teléfono ni email — si hace falta para el CRM, se pide en el chat y se guarda al clasificar el contacto.
- El nombre del contacto se resuelve consultando su perfil con el Page Access Token; si Meta no lo entrega, la conversación se muestra con el PSID.
- El webhook es **único a nivel de app**, compartido por todas las páginas/tenants — cada página debe estar *suscripta* individualmente (`subscribed_apps`), lo cual el flujo OAuth hace automáticamente.
- Los ecos (`message_echoes`) permiten archivar en la bandeja lo que el equipo responde desde la app de Facebook/Meta Business Suite; al detectarlos el agente IA se apaga en ese chat para no pisar a la persona.
- Documentación oficial de referencia: [Messenger Platform — Send API](https://developers.facebook.com/docs/messenger-platform/reference/send-api) y [Webhooks](https://developers.facebook.com/docs/messenger-platform/webhooks).
