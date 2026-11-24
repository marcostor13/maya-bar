# HU71 — App iOS

## Historia

**Como** dueño o vendedor con iPhone,
**quiero** la app de Maya con notificaciones push,
**para** atender desde el móvil igual que en Android.

## Contexto (estado actual)

- La app Android usa Capacitor (`frontend/android`, ver la memoria `android_capacitor_build`) y FCM.
- El push web y FCM ya existen (HU3). No hay proyecto iOS (`frontend/ios` no existe).

## Propuesta

1. `npx cap add ios`, con los mismos plugins.
2. Push con APNs vía FCM: el token de APNs se registra en FCM y el backend lo trata como hoy.
3. Iconos, splash, áreas seguras (HU35) y permisos de micrófono y cámara para las llamadas (HU6) y los adjuntos.
4. Build y firma con Xcode Cloud o Fastlane; envío a TestFlight y luego a la App Store.
5. **[usuario]** Cuenta de Apple Developer (US$99 al año), un Mac o un servicio de build en macOS, y la ficha de la App Store.

## Criterios de aceptación (borrador)

- C1 **[usuario]**: la app instalada por TestFlight inicia sesión y recibe un push de mensaje nuevo con la app cerrada.
- C2: el build de iOS compila en CI.
