# Notificaciones push (Web Push / VAPID)

Cada mensaje nuevo de **Conversaciones** llega al móvil del equipo como
notificación nativa, aunque la plataforma esté cerrada, siempre que se haya
instalado como acceso directo en la pantalla de inicio.

No hay servicio de terceros (ni Firebase ni OneSignal): se usa **Web Push**
estándar con claves VAPID, que es lo que hablan directamente Chrome/Android y
Safari/iOS 16.4+.

## Cómo funciona

```
mensaje entrante (WhatsApp / Instagram)
  → ConversationsService.ingestInbound()
  → PushService.sendToTenant(..., { moduleKey: 'inbox' })
  → servicio de push del navegador (FCM / APNs / Mozilla)
  → public/sw.js  →  showNotification()
  → al tocarla: /inbox?c=<conversationId>
```

| Pieza | Archivo |
| --- | --- |
| Suscripciones y envío | `backend/src/push/push.service.ts` |
| Alta/baja del dispositivo | `backend/src/push/push.controller.ts` |
| Enganche con los mensajes | `backend/src/conversations/conversations.service.ts` (`notifyInbound`) |
| Service worker | `frontend/public/sw.js` |
| Permiso e instalación | `frontend/src/app/shared/push.service.ts` |
| Interfaz (campana) | `frontend/src/app/shared/push-center.ts` |

## Puesta en marcha

### 1. Generar las claves VAPID (una sola vez)

```bash
cd backend
node scripts/generate-vapid.js
```

### 2. Configurarlas en el backend

Variables de entorno del contenedor (Coolify):

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `VAPID_PUBLIC_KEY` | sí | Clave pública. El frontend la pide en `GET /push/public-key`; no hace falta duplicarla en el bundle. |
| `VAPID_PRIVATE_KEY` | sí | Clave privada. **Secreto**: firma cada notificación. |
| `VAPID_SUBJECT` | no | `mailto:` de contacto que exige el estándar. Por defecto `mailto:soporte@mayacrm.site`. |

Sin las dos primeras el servicio arranca igual, avisa por log y las
notificaciones quedan desactivadas: `GET /push/status` devuelve
`enabled: false` y la campana explica que faltan por configurar.

> Regenerar las claves invalida todas las suscripciones existentes. Los
> dispositivos se vuelven a dar de alta solos al abrir la app (el permiso del
> navegador se conserva), pero hasta entonces no reciben avisos.

### 3. Activarlas desde el móvil

- **Android / Chrome**: entrar, tocar la campana y **Activar notificaciones**.
  Si el navegador ofrece instalar la app, el mismo panel muestra el botón.
- **iPhone / iPad**: Safari solo permite pedir el permiso con la plataforma ya
  instalada. Compartir → *Añadir a pantalla de inicio* → abrir Maya desde el
  icono nuevo → campana → **Activar notificaciones**. El panel guía estos pasos
  solo cuando detecta iOS sin instalar.

## Endpoints

Todos bajo `JwtAuthGuard`; no llevan guard de módulo a propósito (cualquiera
con sesión puede querer avisos en su móvil). El filtro por permisos se aplica
al **enviar**.

| Método | Ruta | Para qué |
| --- | --- | --- |
| `GET` | `/push/public-key` | Clave pública y si el servidor está configurado. |
| `GET` | `/push/status` | Si está activo y cuántos dispositivos tiene el usuario. |
| `POST` | `/push/subscribe` | Alta/renovación del dispositivo. |
| `DELETE` | `/push/subscribe` | Baja del dispositivo. |
| `POST` | `/push/test` | Notificación de prueba a los dispositivos del propio usuario. |

## Quién recibe cada aviso

`sendToTenant` filtra por `moduleKey`: solo los usuarios cuyo **rol tenga el
módulo `inbox`** en la matriz de permisos de la empresa. El rol se guarda al
suscribirse y se vuelve a comprobar en cada envío, así que revocar el módulo
corta los avisos sin tener que tocar la suscripción.

Se notifica en dos momentos:

- **Mensaje entrante** de un cliente (nunca los ecos de mensajes propios).
- **Derivación a persona**: cuando el agente IA escala un chat, además del
  aviso por WhatsApp a los números configurados en el agente.

## Detalles que evitan sorpresas

- **Un push nunca bloquea un mensaje.** `notifyInbound` se lanza sin `await` y
  `sendToTenant` captura cualquier error: un fallo del servicio de push jamás
  puede tumbar la recepción de mensajes.
- **Limpieza automática.** Si el servicio responde `404`/`410` (la PWA se
  desinstaló o se revocó el permiso), la suscripción se borra de la base.
- **Sin duplicados.** El `tag` de la notificación es la conversación: los
  mensajes seguidos de un mismo chat reemplazan la notificación anterior en vez
  de apilarse.
- **Sin vibrar por lo que ya estás leyendo.** Si el chat está abierto y visible
  en pantalla, el service worker muestra la notificación en silencio (el
  navegador obliga a mostrar algo por cada push).
- **Cerrar sesión da de baja el dispositivo** en el backend, pero conserva la
  suscripción del navegador: en un móvil compartido, quien sale deja de recibir
  y quien entra la reaprovecha sin volver a pedir permiso.
- **El service worker no cachea la app.** El frontend se sirve con SSR y assets
  hasheados; un caché propio solo conseguiría servir bundles viejos tras cada
  despliegue. `sw.js` y `manifest.webmanifest` se sirven con `no-cache` desde
  `frontend/src/server.ts`, fuera del `maxAge: '1y'` del resto de estáticos.

## Iconos y manifest

`frontend/public/manifest.webmanifest` y `frontend/public/icons/` definen cómo
se ve la app instalada. Los iconos se regeneran desde el logo con:

```bash
cd frontend
python3 scripts/generate-icons.py   # requiere Pillow
```
