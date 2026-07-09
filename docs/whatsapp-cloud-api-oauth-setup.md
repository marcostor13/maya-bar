# Configurar WhatsApp Cloud API (conexión self-service) como canal del agente de IA

Guía para que cada negocio/tenant conecte su propio número de WhatsApp Business a MAYA Platform con un click, usando **Embedded Signup** (Facebook Login for Business) — vigente a julio 2026. Complementa la conexión manual/QR (WAHA) que ya existía; esta es la vía recomendada para **WhatsApp Cloud API**, y soporta **N cuentas por tenant**.

---

## Parte A — Configuración única de la plataforma (una sola vez, la hace el admin de MAYA)

### A.1. Crear (o reutilizar) la app en Meta for Developers

Puede ser la **misma app** que ya usás para Instagram (Parte A de `instagram-dm-setup.md`) — simplemente agregále los productos que faltan, o crear una app separada si preferís mantenerlos aislados.

1. App Dashboard → **Agregar producto** → **WhatsApp** (WhatsApp Business Platform).
2. App Dashboard → **Agregar producto** → **Facebook Login for Business**.

### A.2. Crear la configuración de Embedded Signup

1. Producto **Facebook Login for Business** → **Configurations** → **+ Create Configuration**.
2. Nombre: algo identificable, ej. "MAYA WhatsApp Signup".
3. **Variación de inicio de sesión**: elegí **"Messenger/Whatsapp"** (no "General", ni "Conversions API for Business Messaging", ni "Instagram" — esas son para otros productos).
4. Permisos requeridos:
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
5. Guardá y copiá el **Configuration ID** (lo vas a necesitar en A.4).

### A.3. Dominio autorizado (JS SDK)

El SDK de Facebook corre en el navegador del cliente, así que el dominio del **frontend** de MAYA (`FRONTEND_URL`) tiene que estar en:

- App Dashboard → **Settings → Basic → App Domains**: agregá el dominio del frontend.
- **Facebook Login → Settings → Valid OAuth Redirect URIs**: no es estrictamente necesario para Embedded Signup (no navega a una URL de callback, usa un popup + postMessage), pero si Meta lo exige, agregá la URL del frontend igual.

### A.4. Variables de entorno del backend

```env
FACEBOOK_APP_ID=<App ID>
FACEBOOK_APP_SECRET=<App Secret>
FACEBOOK_LOGIN_CONFIG_ID=<Configuration ID del paso A.2>
```

`PUBLIC_API_URL` ya debería estar configurada (se reutiliza para armar la URL de webhook por cuenta, ver Parte B).

### A.5. Modo de la app y permisos

Mientras la app esté en modo **Desarrollo**, solo podés conectar números que ya estén asociados a tu propia cuenta de prueba/Business Manager. Para que **clientes reales** conecten sus propios números, cada uno pasa por su propio proceso de **Business Verification** (Parte E) — no depende únicamente del switch Development/Live de la app, a diferencia de Instagram.

---

## Parte B — Conectar una cuenta (self-service, cada negocio/tenant)

1. En MAYA: **Agentes IA → Cuentas WhatsApp**.
2. Click en **"Conectar con WhatsApp"**.
3. Se abre un popup de Facebook (SDK embebido, no sale de MAYA) — el dueño del negocio se loguea, elige o crea su WhatsApp Business Account (WABA), selecciona/verifica su número, y acepta los permisos.
4. Al cerrarse el popup, MAYA recibe automáticamente el código de autorización + el WABA ID + el Phone Number ID, canjea todo por un token, registra el número para Cloud API, y suscribe el webhook con una URL propia para esa cuenta — sin copiar ni pegar nada.
5. Repetir para cada número adicional (n cuentas por tenant).

### Cómo funciona técnicamente (a diferencia de Instagram)

- No es un redirect de página completa: el SDK de Facebook (`FB.login()`) abre un popup dentro de la SPA. El `code` llega al callback de `FB.login()`, y el WABA ID + Phone Number ID llegan por un evento `postMessage` (`WA_EMBEDDED_SIGNUP`) que el frontend escucha en paralelo.
- Cada cuenta de WhatsApp Cloud API tiene su **propia URL de webhook** (`{PUBLIC_API_URL}/wa/webhook/cloud/:accountId`) — a diferencia de Instagram, Meta sí permite un *override* de callback por WABA (`POST /{waba_id}/subscribed_apps` con `override_callback_uri`), y MAYA lo configura automáticamente al conectar.

### Renovación del token

El token dura ~60 días. La lista de cuentas muestra el vencimiento; antes de que expire, usá el botón renovar (↻) — extiende el token sin repetir el popup completo.

### Vía manual (WAHA o Cloud API avanzado)

**"Añadir manualmente"** sigue disponible para:
- **WAHA** (self-hosted, conexión por QR) — no tiene equivalente OAuth, es su propio mecanismo de "conexión propia".
- **Cloud API avanzado**: pegar Phone Number ID + Access Token generados vos mismo desde Graph API Explorer. Tras guardar, usá el botón de enlace (🔗) para suscribir el webhook de esa cuenta.

---

## Parte C — Vincular el agente de IA al canal

Ya vinculás cuentas de WhatsApp a un agente desde **Agentes IA → [editar agente] → pestaña Canales → sección WhatsApp** (esto ya existía antes de Instagram/OAuth) — marcá la cuenta recién conectada y publicá el agente.

## Parte D — Probar

- Escribile un WhatsApp al número conectado desde tu teléfono personal.
- El agente debería responder automáticamente usando el webhook por-cuenta ya suscripto.
- Dentro de las 24 horas de la última respuesta del cliente, el agente puede responder libremente. Fuera de esa ventana, cualquier mensaje que MAYA quiera **iniciar** (no responder) necesita una plantilla de mensaje aprobada por Meta — esto no afecta al agente respondiendo consultas entrantes, solo a campañas salientes.

---

## Parte E — Pasar a producción (negocios reales, no solo pruebas)

A diferencia de Instagram, acá el cuello de botella no es tanto "Advanced Access" de la app sino la **verificación de cada negocio conectado**:

### E.1. Business Verification (por cada cliente/tenant, o por vos como Solution Partner)

- Cada WABA que se conecta necesita estar en un Business Manager con **Business Verification** completa (nombre legal, dirección, teléfono — se valida con documentos, 2-7 días hábiles) para desbloquear límites de mensajería de producción.
- Como plataforma (Solution Partner), a veces conviene verificar tu propio Business Manager para operar con mayor límite de clientes gestionados.

### E.2. Aprobación del Display Name

El nombre que se muestra en WhatsApp para cada número (`verified_name`) pasa por una revisión de Meta — rechazos comunes: el nombre no coincide con la identidad real del negocio. Se gestiona durante el proceso de conexión de cada cliente.

### E.3. App Review (si tu app pide permisos avanzados)

Si vas a operar con WABAs que no son tuyos (multi-tenant real), solicitá **Advanced Access** para `whatsapp_business_management` y `whatsapp_business_messaging` en App Review, con caso de uso + video demo del flujo de conexión — igual que hiciste para Instagram.

### E.4. Plantillas de mensaje (solo si vas a hacer campañas salientes)

Cualquier mensaje que la plataforma **inicie** (fuera de una respuesta dentro de las 24h) necesita una plantilla pre-aprobada por Meta (`message_templates`). No es necesario para que el agente de IA conteste DMs entrantes — solo aplica a campañas de marketing salientes (fuera del alcance de esta guía).

---

## Notas y limitaciones

- El registro del número (`/register`) usa un PIN interno fijo que MAYA gestiona automáticamente — no lo ve ni lo necesita el usuario.
- El token de larga duración expira a los ~60 días — hay que renovarlo (botón ↻) antes de que venza.
- WAHA sigue siendo la opción para quienes no quieren pasar por Meta Business en absoluto (usa WhatsApp Web por QR, con sus propias limitaciones y riesgo de baneo por parte de WhatsApp al ser no oficial).
- Documentación oficial de referencia: [Embedded Signup Overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview), [Webhook overrides](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/override/).
