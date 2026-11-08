# HU3 — Notificaciones push en Android e iPhone · Cierre

- **Cerrada:** 2026-11-08
- **Estado:** Terminada con pendientes del usuario
- **Verificación (spec-verifier):** 2.ª vuelta: 18 CUMPLE · 3 PARCIAL · 2 NO VERIFICADO [usuario]. Después se corrigieron el hallazgo alto y dos medios (ver abajo), sin tercera vuelta del verificador.
- **Commits:** sin commit

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Estado del dispositivo y permiso solo al pulsar | CUMPLE (tras corrección) | `shared/notifications-panel.ts`; `core/device-permissions.service.ts` ya no pide notificaciones al arrancar |
| C2 | Guía iPhone sin instalar / iOS < 16.4 | CUMPLE | `notifications-panel.ts`, `shared/push.service.ts` (`iosVersion`) |
| C3 | Permiso negado por plataforma | CUMPLE | `notifications-panel.ts` (`deniedHelp`) |
| C4 | Servidor sin VAPID/Firebase | CUMPLE | `push.controller.ts` `status`, `/devices/status`, panel |
| C5 | Lista de dispositivos y baja por dueño | CUMPLE | `GET/DELETE /push/devices`, `listForUser`/`removeById` |
| C6 | Cada evento por los dos canales | CUMPLE | conversaciones (también derivación por FCM), forms, leads (incluido lead nuevo sin asignar), recordatorios, recuperación |
| C7 | Solo activos con el módulo; chat con dueño → dueño | CUMPLE (tras corrección) | `push-audience.service.ts`: `forModule` y `forUsers` comprueban el módulo del rol actual |
| C8 | No molestar si el chat está abierto | CUMPLE | la bandeja escribe `?c=`; `sw.js` silencia y retira; app sin toast |
| C9 | Agrupar y "N mensajes nuevos" | CUMPLE | `inboundPushBody`, tag por conversación |
| C10 | Extracto ≤ 100 | CUMPLE | `inboundPushBody` |
| C11 | Tocar abre la ruta | CUMPLE (código) | `url` / `data.route`; con la app cerrada en un móvil real: C22 |
| C12 | Insignia del ícono | PARCIAL | Total de mensajes sin leer de la empresa (decisión de la spec), no chats sin leer por usuario; en la app nativa abierta no se actualiza el número |
| C13 | Borrado de caducados | CUMPLE | 404/410 y token FCM no registrado; `invalid-argument` ya no borra tokens |
| C14 | Baja al cerrar sesión / al caducar; "Desactivar" persiste | CUMPLE | `shell.ts`, `dropLocal`, opt-out en localStorage |
| C15 | Un fallo de push no rompe nada | CUMPLE | audiencia y servicios nunca lanzan |
| C16 | Preferencias y silenciar todo | CUMPLE | `User.pushPrefs`, `GET/PUT /push/preferences` |
| C17 | Enviar prueba por los dos canales | CUMPLE | `POST /push/test` |
| C18 | Baja FCM solo del dueño | CUMPLE | `unregisterDevice(token, userId)` |
| C19 | Logs sin contenido | CUMPLE | revisión |
| C20 | Accesibilidad | CUMPLE | `role="switch"`, `aria-checked`, labels, foco visible |
| C21 | Guía del usuario | CUMPLE | `docs/notificaciones-push.md` |
| C22 | Prueba real en Android e iPhone **[usuario]** | NO VERIFICADO | — |
| C23 | Claves en Coolify **[usuario]** | NO VERIFICADO | — |

## Qué se implementó

- `PushAudienceService`: un único criterio de destinatarios para Web Push y FCM (usuario activo, rol actual con el módulo, preferencias, exclusión de quien provoca el evento).
- Preferencias por usuario, lista y baja de dispositivos, prueba por los dos canales, baja de token FCM limitada a su dueño.
- Avisos de chat con extracto, contador, etiqueta por chat e insignia; derivación también por FCM; aviso de lead nuevo sin asignar.
- Panel único de notificaciones en la campana (todo el equipo) y en Configuración: estados por plataforma, guía de iPhone, dispositivos, preferencias y prueba. Funciona también dentro de la app Android.
- "Desactivar" persiste; baja del dispositivo al cerrar sesión y al caducar la sesión; la app Android ya no pide el permiso al arrancar.
- Service worker: insignia y modo silencioso si el chat está abierto. La bandeja refleja el chat abierto en la URL.

## Lo que tiene que hacer el usuario

Guía: [`docs/notificaciones-push.md`](../../../docs/notificaciones-push.md)

1. Generar las claves VAPID (`cd backend && node scripts/generate-vapid.js`) y cargar `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` en Coolify (backend).
2. Cargar `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` y `FIREBASE_PRIVATE_KEY` en Coolify. `frontend/android/app/google-services.json` ya existe; regenerar el APK.
3. Probar en un Android con el APK y en un iPhone (iOS 16.4+) con Maya añadida a la pantalla de inicio.

## Pruebas

- `npm run verify` final (con todas las correcciones): todo OK. Backend 1365/1365, e2e de API 49/49, frontend 640/640, e2e de navegador 13/13, lint y builds OK. `tsc --noEmit` del backend sin errores.

## Pendientes, riesgos y notas

- Insignia por usuario ("chats sin leer míos") en vez del total de la empresa; actualizar el número con la app nativa abierta.
- App nativa de iPhone fuera de alcance (requiere Apple Developer).
- `PushService.save` reasigna la suscripción por `endpoint` sin comprobar el dueño anterior (diseño para móviles compartidos; riesgo bajo, el endpoint no se expone).
- Faltan pruebas automáticas del service worker y del 404 de Web Push.
