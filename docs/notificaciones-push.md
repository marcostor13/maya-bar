# Notificaciones push (Web Push + FCM)

Maya avisa al equipo en el móvil y en el ordenador aunque la app esté cerrada.
Hay dos canales y cada uno necesita sus claves en el servidor:

| Dónde | Canal | Qué hace falta en el servidor |
| --- | --- | --- |
| iPhone / iPad (Maya añadida a la pantalla de inicio, iOS 16.4+) | Web Push | Claves VAPID |
| Android con Maya instalada desde Chrome | Web Push | Claves VAPID |
| Ordenador (Chrome, Edge, Safari, Firefox) | Web Push | Claves VAPID |
| App de Android (APK) | FCM (Firebase) | Proyecto de Firebase |

No hace falta cuenta de Apple Developer: el iPhone recibe los avisos por la
web instalada. Sin claves, la app funciona igual y el panel de notificaciones
dice que el servidor no está configurado.

## Puesta en marcha

### 1. Claves VAPID (iPhone, Android web y ordenador)

1. Generarlas una sola vez:

   ```bash
   cd backend
   node scripts/generate-vapid.js
   ```

2. En Coolify → aplicación **backend** → variables de entorno:

   | Variable | Obligatoria | Descripción |
   | --- | --- | --- |
   | `VAPID_PUBLIC_KEY` | sí | Clave pública. El frontend la pide en `GET /push/public-key`; no hace falta duplicarla en el bundle. |
   | `VAPID_PRIVATE_KEY` | sí | Clave privada. **Secreto**: firma cada notificación. |
   | `VAPID_SUBJECT` | no | `mailto:` de contacto que exige el estándar. Por defecto `mailto:soporte@mayacrm.site`. |

3. Redesplegar el backend. En el log debe salir
   `Notificaciones push activas (VAPID configurado).`

> Regenerar las claves invalida todas las suscripciones. Los dispositivos se
> vuelven a dar de alta solos al abrir la app (el permiso del navegador se
> conserva), salvo los que el usuario desactivó a propósito.

### 2. Firebase (solo la app de Android)

1. <https://console.firebase.google.com> → crear un proyecto.
2. *Añadir app → Android* con el paquete exacto `site.mayacrm.app`.
3. Descargar `google-services.json` a `frontend/android/app/`. Sin él el APK
   compila, pero no recibe avisos.
4. *Configuración del proyecto → Cuentas de servicio → Generar nueva clave
   privada*. Del JSON salen tres variables del backend en Coolify:

   ```
   FIREBASE_PROJECT_ID=<project_id>
   FIREBASE_CLIENT_EMAIL=<client_email>
   FIREBASE_PRIVATE_KEY=<private_key, en una línea con los saltos como \n>
   ```

5. Redesplegar el backend (log: `Push activado para el proyecto …`) y volver a
   generar el APK (`docs/android-app.md`) para que incluya `google-services.json`.

### 3. Instalar y activar en cada dispositivo

- **iPhone / iPad (iOS 16.4+)**: abrir `https://mayacrm.site` en **Safari** →
  **Compartir** → **Añadir a pantalla de inicio** → abrir Maya **desde el
  ícono nuevo** e iniciar sesión → campana → **Activar notificaciones** →
  **Permitir**. Desde una pestaña de Safari iOS no entrega avisos; si se borra
  el ícono hay que repetirlo. El panel guía estos pasos y avisa si iOS es
  anterior a 16.4.
- **Android (web)**: Chrome → menú ⋮ → **Instalar app** (o el botón "Instalar
  la app" del panel) → campana → **Activar notificaciones**.
- **Android (APK)**: instalar, iniciar sesión → campana o Configuración →
  Notificaciones → **Activar notificaciones**. Android solo pregunta una vez.
- **Ordenador**: campana → **Activar notificaciones**.

## Qué puede hacer cada usuario

El mismo panel está en la campana de la cabecera (todo el equipo) y en
Configuración → Notificaciones:

- Activar o desactivar los avisos en el dispositivo actual. "Desactivar" queda
  anotado en el dispositivo: no se reactivan solos al volver a abrir la app.
- **Enviar prueba** a todos sus dispositivos (ignora las preferencias).
- Ver sus dispositivos (navegadores y apps) y quitar cualquiera.
- Elegir qué avisos recibir: chats, formularios, leads, recuperación, o
  **Silenciar todo**. Se guarda en el usuario (`User.pushPrefs`), así que vale
  para todos sus dispositivos.

## Cómo funciona

```
evento (mensaje, derivación, formulario, lead, recordatorio, recuperación)
  → PushService (Web Push) y NativePushService (FCM), en paralelo
  → PushAudienceService decide quién: usuarios activos de la empresa, con el
    módulo en su rol ACTUAL y el tipo de aviso permitido en sus preferencias
  → navegador: public/sw.js → showNotification()   ·   app: FCM → Android
  → al tocarla: la ruta del aviso (/inbox?c=…, /leads?lead=…, /forms, /recuperacion/…)
```

| Pieza | Archivo |
| --- | --- |
| Destinatarios y preferencias | `backend/src/push/push-audience.service.ts` |
| Web Push: suscripciones y envío | `backend/src/push/push.service.ts` |
| Endpoints de push, dispositivos y preferencias | `backend/src/push/push.controller.ts` |
| FCM: tokens y envío | `backend/src/notifications/push.service.ts` |
| Alta/baja del token de la app | `backend/src/notifications/notifications.controller.ts` |
| Avisos de mensajes y derivaciones | `backend/src/conversations/conversations.service.ts` (`notifyInbound`, `escalateToHuman`) |
| Service worker | `frontend/public/sw.js` |
| Permiso, suscripción e instalación (web) | `frontend/src/app/shared/push.service.ts` |
| Permiso y token (app Android) | `frontend/src/app/core/push.service.ts` |
| Panel (campana y Configuración) | `frontend/src/app/shared/notifications-panel.ts` |

Tipos de aviso: `chats` (módulo `inbox`: mensajes y derivaciones), `forms`,
`leads` (asignación y recordatorios), `recovery` (módulo `campaigns`).

## Endpoints

Todos bajo `JwtAuthGuard` y siempre sobre el usuario del token; no llevan guard
de módulo a propósito (cualquiera con sesión puede querer avisos). El filtro por
permisos se aplica al **enviar**.

| Método | Ruta | Para qué |
| --- | --- | --- |
| `GET` | `/push/public-key` | Clave pública y si el servidor está configurado. |
| `GET` | `/push/status` | Si Web Push está activo y cuántos navegadores tiene el usuario. |
| `POST` | `/push/subscribe` | Alta/renovación del navegador. Devuelve `{ id }`. |
| `DELETE` | `/push/subscribe` | Baja del navegador actual. |
| `GET` | `/push/devices` | Dispositivos del usuario (sin endpoints ni tokens). |
| `DELETE` | `/push/devices/:kind/:id` | Quita uno de sus dispositivos (`web`, `android`, `ios`). |
| `GET` / `PUT` | `/push/preferences` | Qué avisos quiere recibir. |
| `POST` | `/push/test` | Prueba por los dos canales a todos sus dispositivos. |
| `GET` | `/devices/status` | Si FCM está activo. |
| `POST` | `/devices` | Alta del token de la app. Devuelve `{ ok, id }`. |
| `DELETE` | `/devices/:token` | Baja del token, solo si es del usuario. |

## Detalles que evitan sorpresas

- **Un push nunca bloquea nada.** Los envíos van sin `await` o con
  `allSettled`, y ni la audiencia ni los servicios lanzan.
- **Limpieza automática.** `404`/`410` en Web Push y token no registrado en FCM
  borran el registro en ese mismo envío.
- **Un aviso por chat.** La etiqueta es la conversación: los mensajes seguidos
  reemplazan la notificación anterior y el texto dice cuántos van
  ("3 mensajes nuevos · …"). Extracto de hasta 100 caracteres.
- **Insignia del ícono.** Los avisos de chat llevan el total sin leer de la
  empresa (`badge` en Web Push, `notificationCount` en FCM); con la app
  abierta se sincroniza con `navigator.setAppBadge` y se limpia al llegar a 0.
- **Sin molestar por lo que ya estás leyendo.** En el navegador la notificación
  se muestra en silencio y se retira al instante (iOS y Chrome exigen mostrar
  algo por cada push); en la app no sale el aviso interno.
- **Cerrar sesión da de baja el dispositivo** en el backend, pero conserva la
  suscripción del navegador: en un móvil compartido quien entra la reaprovecha
  sin volver a pedir permiso.
- **El service worker no cachea la app.** El frontend se sirve con SSR y assets
  hasheados. `sw.js` y `manifest.webmanifest` se sirven con `no-cache` desde
  `frontend/src/server.ts`.

## Problemas frecuentes

| Síntoma | Causa y solución |
| --- | --- |
| "Las notificaciones aún no están habilitadas en el servidor" | Faltan las claves VAPID (web) o Firebase (app) en Coolify. |
| En iPhone no aparece el botón de activar | Maya está abierta en Safari: abrirla desde el ícono de la pantalla de inicio. |
| Permiso bloqueado | iPhone: Ajustes → Notificaciones → Maya CRM. App Android: Ajustes → Aplicaciones → Maya → Notificaciones. Chrome: Configuración de sitios → Notificaciones. |
| La app de Android no recibe nada | Falta `google-services.json` en el APK o las variables `FIREBASE_*`. |

## Iconos y manifest

`frontend/public/manifest.webmanifest` y `frontend/public/icons/` definen cómo
se ve la app instalada. Los iconos se regeneran desde el logo con:

```bash
cd frontend
python3 scripts/generate-icons.py   # requiere Pillow
```

---

# Clasificación de conversaciones

Desde el chat se puede etiquetar al contacto y mandarlo al embudo sin salir de
la bandeja. La hoja **Clasificar** vive en la cabecera del hilo (escritorio) y
en la hoja de acciones (móvil).

| Método | Ruta | Para qué |
| --- | --- | --- |
| `GET` | `/conversations/tags` | Etiquetas ya usadas en el tenant, para sugerirlas. |
| `PATCH` | `/conversations/:id/tags` | Fija las etiquetas del contacto del chat. |
| `POST` | `/conversations/:id/lead` | Crea la oportunidad enlazada a la conversación. |

Decisiones que conviene no deshacer sin querer:

- **Clasificar crea el contacto si no existía.** Etiquetar tiene que funcionar
  de un toque; obligar a rellenar antes la ficha completa mataba el flujo.
  Lo resuelve `ensureCustomer`, que comparte con "Guardar contacto" la forma de
  deducir nombre y teléfono según el canal.
- **Las etiquetas se reemplazan, no se fusionan.** La pantalla es una lista de
  interruptores: quitar una etiqueta tiene que quitarla de verdad. Tope de 12
  por contacto.
- **No se duplica la oportunidad.** Si el contacto ya tiene una abierta se
  devuelve esa (`created: false`); si las anteriores están ganadas o perdidas,
  se crea una nueva.
- **La lista de chats trae las etiquetas** en una sola consulta para toda la
  página (`tagsByCustomer`), no una por conversación: clasificar no sirve de
  nada si no se ve la clasificación al elegir a quién atender.
- `GET /conversations/tags` se declara **antes** que `GET /conversations/:id`,
  o Nest resolvería `tags` como un id.
