# Meta: conexión de Messenger, revisión de la app y pendientes

Estado al 2026-11-05. Documento para retomar el trabajo con la app de Meta
"Maya IA" (`985986576689480`, portfolio `1181735023516920`).

## 1. Lo que ya está hecho

| Qué | Commit | Estado |
|---|---|---|
| Estado de Messenger con `/debug_token` usando el propio token de la Página (sin `pages_read_engagement`, vale para tokens de cualquier app) | `ededa04` | En producción |
| Páginas `/privacidad`, `/terminos`, `/eliminacion-datos` (prerenderizadas, enlazadas en el pie de la landing) | `21fc8a6` | En producción, pero sirven la plantilla vacía |
| `server.ts` sirve el HTML prerenderizado de esas tres rutas | `93a7c01` | En `main`, **sin desplegar** |

La verificación del negocio en Meta ya está **aprobada**.

## 2. Pendientes, en orden

1. **Secrets de GitHub Actions.** Apuntan a otro Coolify: el workflow `deploy.yml`
   sale "success", pero producción no cambia. Hasta corregirlos, cada push se
   despliega a mano (`npm run deploy:backend` / `npm run deploy:frontend`). Desde
   la raíz del proyecto, en bash:
   ```bash
   for k in COOLIFY_URL COOLIFY_TOKEN COOLIFY_BACKEND_UUID COOLIFY_FRONTEND_UUID; do
     v=$(grep -E "^$k=" .env | head -1 | cut -d= -f2- | tr -d "\r\"'")
     gh secret set "$k" --body "$v"
   done; gh secret list
   ```
2. **Desplegar el frontend** (`93a7c01`) y comprobar que las tres URLs muestren
   su texto, no la plantilla vacía.
3. **Configuración > Básica de la app en Meta:**
   - Política de privacidad: `https://mayacrm.site/privacidad`
   - Condiciones del servicio: `https://mayacrm.site/terminos`
   - Eliminación de datos (instrucciones): `https://mayacrm.site/eliminacion-datos`
     (hoy dice `https://www.facebook.com/`, que no vale)
   - Dominios de la app: añadir `mayacrm.site` y `api.mayacrm.site`
     (hoy solo están los de `marcostorresalarcon.com`)
4. **Cuenta de Messenger actual** (Página `233616316658526`): su token es de
   otra app ("Farma", `1090403567148146`) y solo tiene `pages_messaging`. Falta
   `pages_manage_metadata`, así que no puede suscribirse al webhook. Elegir un
   camino de la sección 4 y reconectarla.
5. **Videos de la revisión**, uno por permiso: conectar la Página o la cuenta de
   Instagram desde Maya, recibir un mensaje y responderlo. Hace falta:
   - qué Página y qué Instagram usar;
   - otra cuenta que escriba a la Página durante la grabación (responder envía un
     mensaje real);
   - `ffmpeg` para pasar a MP4 (la herramienta de grabación saca GIF);
   - interfaz en inglés o subtítulos que expliquen cada paso.
6. **Enviar la revisión.** El borrador existe con estado "No enviada". Pedir
   acceso avanzado para `pages_messaging`, `pages_manage_metadata`,
   `pages_show_list`, `instagram_business_basic`,
   `instagram_business_manage_messages`, `whatsapp_business_management` y
   `whatsapp_business_messaging`. `pages_read_engagement` ya no hace falta y
   conviene quitarlo de la solicitud y de los scopes del OAuth
   (`backend/src/messenger/messenger-oauth.service.ts`).
7. **WhatsApp como proveedor de tecnología:** Inicio rápido > "Continuar
   registro" (el paso 2 es la revisión del punto 6) y añadir un método de pago
   (sin él solo se responden conversaciones que inicia el cliente).
8. **Pasar la app a modo Activo** cuando se aprueben los permisos.

## 2b. Revisión de `pages_messaging` en la app "Farma" (en curso)

- Solicitud `1093149523540217`: quedan `pages_show_list`, `pages_manage_metadata`,
  `pages_messaging` y `public_profile` (se quitaron de la solicitud los de
  WhatsApp y `business_management`; siguen activos en la app).
- Descripciones (en inglés), video
  (`farma-pages_messaging-review.mp4`, 46 s) e instrucciones para revisores ya
  cargados. Página elegida: Boticas Farmacenter.
- Completo al 2026-11-05: verificación, configuración, tratamiento de datos,
  instrucciones para revisores (plataforma Sitio web
  `https://www.farmacenter.com.pe/`, video adjunto) y las casillas de "uso
  permitido" de los cuatro permisos.
- Falta solo que Meta registre la llamada de prueba de `pages_manage_metadata`
  (hecha el 2026-11-05 con "Suscribir webhook" desde Maya; tarda hasta 24 h).
  Luego: "Enviar para revisión". Si a las 24 h sigue en "0 de 1", repetir la
  llamada.
- La conversación de prueba "Messenger" (Farma Center) quedó en modo Manual:
  reactivar el agente IA.
- Commit `89ce038` (pie de foto como mensaje aparte en Messenger/Instagram)
  desplegado.

## 3. Por qué no se puede conectar cualquier Página hoy

- La app está en **modo Desarrollo**. En ese modo, Messenger solo entrega al
  webhook los mensajes de personas con un rol en la app, y solo se les puede
  responder a ellas. Los clientes reales de una Página no llegan.
- Todos los permisos tienen **acceso estándar**. Ese acceso solo cubre los datos
  de usuarios con rol en la app y los activos de la propia empresa. Las Páginas
  de terceros necesitan acceso avanzado, que es lo que da la revisión.

## 4. Cómo vincular Messenger sin la revisión

> **Comprobado el 2026-11-05 con Boticas Farmacenter (app "Farma", publicada,
> token de Página correcto):** se **reciben** los mensajes, pero Meta rechaza
> **todo envío** a quien no tenga rol en la app: "No se pueden enviar mensajes a
> usuarios que no sean administradores, desarrolladores o evaluadores de la app
> antes de que se revise el permiso pages_messaging y la app esté disponible
> públicamente". O sea: **responder al público exige `pages_messaging` con acceso
> avanzado (revisión)**, aunque la Página sea del dueño de la app y la app esté
> publicada. Lo de abajo sirve para conectar y probar con personas que tengan rol
> en la app, no para atender clientes reales.
>
> Token correcto para Farma: usuario del sistema **"farmacenter"** (no
> "Employee") → token con `pages_show_list`, `pages_messaging`,
> `pages_manage_metadata`, `pages_read_engagement` → `GET me/accounts` → el
> `access_token` de la Página. Un token de usuario del sistema pegado
> directamente da "(#100) El identificador de la página de la solicitud no
> coincide…".

Mientras llega la aprobación hay tres caminos. Todos usan el acceso estándar.
Los puntos marcados como "a confirmar" hay que probarlos con una Página real
antes de ofrecérselos a un cliente.

### A. La app del propio cliente (como la cuenta "Farma") — recomendado para ahora

El cliente crea su propia app de Meta (tipo Negocios) y conecta su Página a mano
en Maya (Configuración > Messenger > Page ID + token).

- Funciona hoy sin cambios de código: el webhook enruta por `pageId` y no valida
  la firma de la app, y el estado ya sirve con tokens de cualquier app.
- Como la Página es suya, el acceso estándar le basta. Su app puede pasar a modo
  Activo sin revisión si tiene la política de privacidad, la URL de eliminación
  de datos, categoría e ícono (puede usar las páginas de `mayacrm.site`).
- Pasos para el cliente:
  1. En su app: añadir Messenger y generar el token de la Página con
     `pages_messaging` **y** `pages_manage_metadata`.
  2. En Webhooks de su app (objeto Page): URL `https://api.mayacrm.site/messenger/webhook`
     y el verify token `MESSENGER_VERIFY_TOKEN` (el que muestra Maya en
     Configuración > Messenger). Suscribir `messages`, `messaging_postbacks`,
     `message_echoes`, `message_reads`.
  3. En Maya: pegar Page ID y token, y pulsar "Suscribir webhook".
  4. Pasar su app a modo Activo. Si no, solo llegan los mensajes de quien tenga
     rol en su app.
- Contras: cada cliente gestiona una app de Meta; el token de usuario hay que
  renovarlo si no se usó uno de larga duración o de usuario del sistema.

### B. El cliente comparte su Página con el portfolio de Maya — a confirmar

1. El cliente, en su Business Manager, añade el portfolio de Maya
   (`1181735023516920`) como **socio** con acceso a la Página (tarea Messenger).
2. Un administrador de Maya con rol en la app "Maya IA" usa "Conectar con
   Facebook". La Página aparece en `/me/accounts` y se conecta con la app de Maya.
3. La app Maya IA tiene que estar en modo Activo para recibir mensajes de
   cualquier persona (a confirmar: que el acceso estándar cubra Páginas
   compartidas como socio).

Ventaja: un solo webhook y una sola app, y no hay tokens pegados a mano. El
alta de cada cliente es manual (aceptar el socio).

### C. Dar rol en la app "Maya IA" al administrador de la Página

Se añade al usuario de Facebook del cliente como **Tester** en Roles de la app;
acepta la invitación y conecta con "Conectar con Facebook".

- Con la app en Desarrollo solo sirve para probar: los mensajes del público no
  llegan.
- Con la app en modo Activo y acceso estándar debería funcionar con el público
  (a confirmar). Expone el panel de la app a terceros, así que solo sirve para
  pocos clientes de confianza.

### Pasar "Maya IA" a modo Activo sin revisión

Los caminos B y C lo necesitan. Las apps de negocio pueden pasar a Activo solo
con acceso estándar. Requisitos: los datos del punto 2.3 y el ícono. No da
acceso a Páginas de terceros (eso sigue necesitando la revisión), pero sí deja
que los mensajes del público lleguen a las Páginas cubiertas por el acceso
estándar.

## 5. Riesgo a corregir

`backend/src/conversations/messenger-webhook.controller.ts` no valida
`X-Hub-Signature-256`, así que cualquiera puede enviar eventos falsos si conoce
un `pageId`. Eso es lo que permite el camino A. Para cerrarlo sin romper A, hay
que guardar en cada cuenta el *app secret* de la app que la conectó (o el de
Maya por defecto) y validar la firma con ese secreto.
