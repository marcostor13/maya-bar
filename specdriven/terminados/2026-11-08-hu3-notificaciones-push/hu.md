# HU3 — Notificaciones push en Android e iPhone

## Historia

**Como** vendedor o administrador de una empresa que usa Maya CRM,
**quiero** recibir notificaciones push en mi móvil, sea Android o iPhone, aunque
tenga la app cerrada,
**para** responder a tiempo a los clientes y no perder ventas por no estar
mirando la pantalla.

## Contexto (estado actual del código)

- **Web / PWA**: `frontend/public/manifest.webmanifest`, `frontend/public/sw.js`,
  `frontend/src/app/shared/push.service.ts` y `backend/src/push/push.service.ts`
  (Web Push con claves VAPID). Requiere `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
  y `VAPID_SUBJECT` en el backend; sin ellas queda desactivado.
- **Android nativo (Capacitor)**: `frontend/src/app/core/push.service.ts` y
  `backend/src/notifications/push.service.ts` (`NativePushService`, FCM).
  Falta `google-services.json` y las variables `FIREBASE_*`; hoy no llega nada.
- **iOS nativo**: no existe el proyecto `frontend/ios` y no se creará en esta
  historia (requiere cuenta de pago de Apple Developer). En iPhone se usa la
  web instalada en la pantalla de inicio (PWA), que recibe Web Push sin cuenta
  de Apple.
- Los servicios que avisan (conversaciones, formularios, leads, recordatorios de
  leads y recuperación) ya llaman a los dos canales (`PushService` y
  `NativePushService`).
- Guía actual: `docs/android-app.md`.

## Qué se pide

Que las notificaciones push funcionen de punta a punta en:

1. **Android – app instalada (APK / Play Store)** vía FCM.
2. **Android – web instalada** (Chrome → "Instalar app") vía Web Push.
3. **iPhone – web instalada en la pantalla de inicio** (Safari → Compartir →
   "Añadir a pantalla de inicio", iOS 16.4+) vía Web Push.
4. **Escritorio** (Chrome, Edge, Safari macOS) vía Web Push, sin romper lo que ya
   funciona.

## Criterios de aceptación

### Activación
- C1. En **Configuración → Notificaciones** el usuario ve si su dispositivo
  actual tiene las notificaciones activas y un botón para activarlas o
  desactivarlas. El permiso del sistema solo se pide al pulsar ese botón, nunca
  al entrar.
- C2. En iPhone abierto desde Safari (no instalado), en lugar del botón se
  muestra una guía corta con los pasos para añadir Maya a la pantalla de inicio
  (con íconos lucide, sin emojis). En iOS < 16.4 se indica que hay que
  actualizar iOS.
- C3. Si el usuario negó el permiso, se explica cómo reactivarlo desde los
  ajustes del sistema según su plataforma (Android, iPhone, escritorio).
- C4. Si el servidor no tiene el canal configurado (sin VAPID o sin Firebase),
  la pantalla lo dice claramente y el resto de la app funciona igual.
- C5. Un usuario puede tener varios dispositivos activos a la vez (por ejemplo,
  móvil y portátil); cada uno aparece en la lista con plataforma, navegador o
  modelo y fecha de alta, y se puede dar de baja uno por uno.

### Envío
- C6. Llegan notificaciones en todos los dispositivos activos del usuario,
  con la app cerrada o en segundo plano, para:
  - mensaje entrante de WhatsApp / Instagram / Messenger (módulo `inbox`);
  - registro nuevo en un formulario (`forms`);
  - lead nuevo o asignado y recordatorio de lead (`leads`);
  - avisos de la recuperación de clientes (`campaigns`).
- C7. Solo reciben el aviso los usuarios con permiso sobre ese módulo y que
  pertenecen a la empresa (multitenant estricto). Un mensaje asignado a un
  vendedor concreto le llega a él; uno sin asignar, a quienes tengan `inbox`.
- C8. Si la conversación ya está abierta en primer plano en ese dispositivo, no
  se muestra la notificación del sistema (se actualiza la pantalla en su lugar).
- C9. Varios mensajes seguidos del mismo chat se agrupan en una sola
  notificación que se actualiza (no una por mensaje).
- C10. La notificación muestra el nombre del contacto y un extracto del mensaje
  (máx. ~100 caracteres); para adjuntos, "Foto", "Audio", etc.
- C11. Tocar la notificación abre la app directamente en la conversación, lead o
  formulario correspondiente, también con la app cerrada y en las cuatro
  plataformas.
- C12. El ícono en la pantalla de inicio muestra el número de chats sin leer
  (Badging API en la PWA, también en iPhone; badge nativo en la app Android) y se limpia al leerlos.

### Robustez
- C13. Las suscripciones o tokens caducados o rechazados (410/404 en Web Push,
  `UNREGISTERED` en FCM) se borran solos en el primer envío fallido.
- C14. Al cerrar sesión se da de baja el dispositivo; al iniciar sesión con otro
  usuario en el mismo móvil no le llegan avisos del anterior.
- C15. Un fallo del proveedor de push nunca hace fallar la recepción del mensaje
  ni la operación que originó el aviso; queda registrado en el log.
- C16. Cada usuario puede elegir en Configuración qué tipos de aviso quiere
  (chats, formularios, leads, recuperación) y silenciarlos todos de una vez.

### iPhone (PWA) y app Android
- C17. La PWA cumple lo que iOS exige para Web Push: `manifest.webmanifest` con
  `display: standalone`, íconos `apple-touch-icon` en `index.html`, service
  worker registrado en el ámbito `/`, y la suscripción se crea solo tras un
  toque del usuario. Probado de punta a punta en un iPhone real con la app
  añadida a la pantalla de inicio.
- C18. La app Android pide el permiso `POST_NOTIFICATIONS` (Android 13+) solo al
  pulsar el botón y tiene un canal de notificación "Mensajes" con sonido.
- C19. El backend envía a la app Android por FCM (Firebase Admin) y a navegadores
  y PWA (incluido iPhone) por Web Push, con `tag`/agrupación por conversación,
  sonido y badge.

### Pruebas y documentación
- C20. Pruebas unitarias de backend para la selección de destinatarios, las
  preferencias, la agrupación y el borrado de tokens caducados; y de frontend
  para la pantalla de Configuración en cada estado (no soportado, iPhone sin
  instalar, permiso negado, activo, servidor sin configurar).
- C21. Botón "Enviar notificación de prueba" en Configuración que manda un aviso
  a todos los dispositivos del usuario.
- C22. `docs/notificaciones-push.md` con los pasos para el usuario: generar las
  claves VAPID, crear el proyecto Firebase (solo Android), variables en Coolify,
  compilar el APK, e instalar la PWA en iPhone y Android (con capturas o pasos
  claros para Safari). `docs/android-app.md` enlaza a esta guía.

## Pendiente del usuario [usuario]

- Generar o pegar las claves VAPID en Coolify (backend).
- Crear el proyecto en Firebase, registrar la app Android, descargar
  `google-services.json` y poner las variables `FIREBASE_*` en Coolify.
- Probar en dispositivos reales: un Android con el APK y un iPhone con iOS 16.4+
  con Maya añadida a la pantalla de inicio.

## Fuera de alcance

- App nativa de iPhone (`frontend/ios`) y publicación en App Store: requieren
  cuenta de pago de Apple Developer; queda para una historia futura.
- Publicar en Play Store.
- Notificaciones por SMS o correo.
- Push a los clientes finales de la empresa (solo al equipo de Maya).
