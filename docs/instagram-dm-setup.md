# Configurar Instagram DM como canal del agente de IA

Guía para conectar cuentas de Instagram (Business/Creator) al canal de IA de MAYA Platform. Usa el flujo **"Instagram API with Instagram Login"** de Meta, vigente a julio 2026 — no requiere vincular una Página de Facebook. La plataforma soporta **N cuentas de Instagram por tenant**, cada negocio conecta la suya con un click (OAuth), sin pegar tokens a mano.

---

## Parte A — Configuración única de la plataforma (una sola vez, la hace el admin de MAYA)

### A.1. Crear la app en Meta for Developers

1. Entra a [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Crear app** → tipo **"Otro"** → **"Empresa"**.
2. Agrega el producto **"Instagram"** → **"API setup with Instagram login"** (no el "Instagram Graph API" clásico ligado a Páginas).

### A.2. Configurar el redirect URI de OAuth

En el producto Instagram → **Business login settings** → **Valid OAuth Redirect URIs**, agrega exactamente:

```
{PUBLIC_API_URL}/instagram-accounts/oauth/callback
```

(reemplaza `{PUBLIC_API_URL}` por la URL pública real del backend, ej. `https://apimayabar.marcostorresalarcon.com`).

### A.3. Configurar el webhook (uno solo para toda la app)

Meta permite **una única URL de webhook por app** — no una distinta por cuenta conectada. Todas las cuentas de Instagram de todos los tenants comparten esta misma URL; el backend distingue la cuenta usando el ID que Meta manda en cada evento.

1. App Dashboard → producto Instagram → **Webhooks**.
2. **Callback URL**: `{PUBLIC_API_URL}/ig/webhook`
3. **Verify Token**: cualquier string secreto (ej. `maya-ig-2026-xyz`) — debe coincidir con la variable de entorno del paso A.4.
4. Suscribite al campo **`messages`**.

### A.4. Variables de entorno del backend

```env
INSTAGRAM_APP_ID=<App ID de developers.facebook.com>
INSTAGRAM_APP_SECRET=<App Secret>
INSTAGRAM_VERIFY_TOKEN=<el mismo string del paso A.3>
```

`PUBLIC_API_URL` y `FRONTEND_URL` ya deberían estar configuradas (se reutilizan para armar el redirect URI y para volver a la app tras conectar).

### A.5. Permisos y modo de la app

Se solicitan automáticamente al conectar cada cuenta (Parte B):

- `instagram_business_basic`
- `instagram_business_manage_messages`

Mientras la app esté en modo **Desarrollo**, solo cuentas agregadas como *testers*/roles en el dashboard pueden conectarse (hasta 25). Para producción con cuentas de clientes/terceros hay que enviar la app a **App Review** solicitando `instagram_business_manage_messages` con "Advanced Access" — Meta pide un video demo del flujo de mensajería.

---

## Parte B — Conectar una cuenta (self-service, cada negocio/tenant)

1. En MAYA: **Agentes IA → Cuentas Instagram**.
2. Click en **"Conectar con Instagram"**.
3. Se abre la pantalla de autorización de Instagram — el dueño de la cuenta se loguea y acepta los permisos.
4. Vuelve automáticamente a MAYA con la cuenta ya creada, el token guardado y el webhook suscripto — no hay que copiar ni pegar nada.
5. Repetir el proceso para cada cuenta adicional que se quiera conectar (n cuentas por tenant).

### Renovación del token

El token dura ~60 días. La lista de cuentas muestra la fecha de vencimiento; antes de que expire, usa el botón de renovar (ícono ↻ junto al nombre de la cuenta) — llama a Meta y extiende el token otros 60 días sin volver a pasar por la autorización completa.

### Vía manual (avanzado / legacy)

Si preferís generar el token vos mismo desde Graph API Explorer en vez de usar el botón de conectar, existe **"Añadir manualmente"** en la misma pantalla, pidiendo Instagram User ID + Access Token. Tras guardar, usa el botón de enlace (🔗) en la cuenta para suscribirla al webhook — sin esto, Meta no envía los mensajes entrantes.

---

## Parte C — Vincular el agente de IA al canal

1. En **Agentes IA**, edita el agente que va a responder por Instagram.
2. Pestaña **Canales** → sección **Instagram (DM)** → marca la(s) cuenta(s) conectadas por las que debe responder.
3. Activa **Publicado** y guarda.

## Parte D — Probar

- Desde una cuenta personal de Instagram (agregada como tester si la app sigue en modo Desarrollo), envía un DM a la cuenta profesional conectada.
- MAYA recibe el evento por el webhook único, identifica la cuenta y el tenant, genera la respuesta con IA y contesta.
- Restricción de Meta: solo se puede responder dentro de las **24 horas** posteriores al último mensaje del usuario (ventana de mensajería estándar).

---

## Parte E — Pasar a producción (modo Live, cualquier cuenta puede conectarse)

Mientras la app esté en modo **Desarrollo**, solo las cuentas agregadas a mano como *tester* pueden usar "Conectar con Instagram". Para que cualquier negocio/tenant conecte la suya sin que vos la agregues manualmente, hay que pasar por **App Review** de Meta:

### E.1. Completar la configuración básica de la app

En App Dashboard → **Settings → Basic**:
- **App Icon** (1024×1024).
- **Privacy Policy URL** y **Terms of Service URL** (pueden ser páginas simples de MAYA).
- **Categoría** de la app (ej. "Business").
- **Data Deletion**: una URL de callback o, más simple, una página con instrucciones de cómo un usuario puede pedir que se borren sus datos.

### E.2. Generar evidencia de uso real

Meta exige al menos **una llamada exitosa a la API con cada permiso solicitado** dentro de los 30 días previos al envío. Como ya usaste "Conectar con Instagram" con tu cuenta de prueba (Parte D), esto ya debería estar cubierto — si pasó más de un mes, repetí el flujo antes de enviar.

### E.3. Solicitar Advanced Access

App Dashboard → **App Review → Permissions and Features** → buscá cada permiso y click **"Request Advanced Access"**:
- `instagram_business_basic`
- `instagram_business_manage_messages`

Para cada uno, Meta pide:
- **Descripción del caso de uso**: explicá que es un agente de atención al cliente con IA que responde DMs de Instagram para negocios (bares/restaurantes) usando MAYA Platform.
- **Video demo**: grabación de pantalla mostrando el flujo completo — click en "Conectar con Instagram", autorización, vuelta a MAYA con la cuenta conectada, un DM de prueba llegando y el agente respondiendo automáticamente.

### E.4. Business Verification (puede ser requerida)

Para permisos sensibles como mensajería, Meta a veces exige verificar la identidad del negocio en **Meta Business Manager** (razón social, documentos). Se puede completar en paralelo al App Review — un desarrollador puede pasar el review sin esto en algunos casos, pero si Meta lo pide, hay que completarlo para que la aprobación avance.

### E.5. Enviar y esperar

No hay un SLA fijo (puede ser desde días hasta un par de semanas). Motivos comunes de rechazo: caso de uso vago, falta de video demo, falta de Privacy Policy. Si rechazan, corregís lo señalado y reenviás.

### E.6. Activar modo Live

Una vez aprobados los permisos, arriba del App Dashboard hay un switch **Development / Live** — cambialo a **Live**. A partir de ahí, cualquier cuenta profesional de Instagram puede usar "Conectar con Instagram" en MAYA sin que la agregues como tester.

> Meta puede pedir periódicamente un **"Data Use Checkup"** para mantener el acceso avanzado — es un cuestionario corto de re-confirmación, no un nuevo review completo.

---

## Notas y limitaciones

- No hace falta Página de Facebook vinculada con este flujo (a diferencia del método clásico "Instagram Graph API" de años anteriores).
- El webhook es **único a nivel de app**, compartido por todas las cuentas/tenants — cada cuenta debe estar *suscripta* individualmente (`subscribed_apps`), lo cual el flujo OAuth hace automáticamente.
- El token de larga duración expira a los ~60 días — hay que renovarlo (botón ↻) antes de que venza, o la cuenta deja de responder.
- Documentación oficial de referencia: [Instagram API with Instagram Login — Messaging](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/) y [Webhooks](https://developers.facebook.com/docs/instagram-platform/webhooks).
