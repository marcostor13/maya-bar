# HU3 — Notificaciones push en Android e iPhone · Tareas

- [x] T1 — `User.pushPrefs` + `PushAudienceService` (activo, módulo, categoría, exclusión) → C7, C15, C16 · prueba: `push-audience.service.spec.ts`
- [x] T2 — Web Push y FCM usan la audiencia; `sendToUsers` web; `badge`/`notificationCount`/sonido; logs sin contenido → C7, C12, C13, C19 · prueba: specs de ambos servicios
- [x] T3 — API: dispositivos (lista/baja), preferencias, prueba por los dos canales, `subscribe`/`devices` devuelven id, baja FCM limitada al dueño → C5, C17, C18 · prueba: `push.controller.spec.ts`, `push.service.spec.ts` (native)
- [x] T4 — Llamadas con categoría; conversaciones: extracto ≤ 100, contador, badge, derivación por FCM → C6, C9, C10, C11, C12 · prueba: specs de conversaciones/forms/leads/recovery
- [x] T5 — Frontend servicios: opt-out persistente, deviceId, iOS version, server status nativo, supresión de toast, badge en realtime, `sw.js` → C8, C12, C14 · prueba: specs de servicios
- [x] T6 — Configuración → Notificaciones unificada (estados, guía iOS, permiso negado, dispositivos, preferencias, prueba) y campana nativa → C1–C5, C16, C20 · prueba: `shared/notifications-panel.spec.ts`
- [x] T7 — `docs/notificaciones-push.md` y enlace desde `docs/android-app.md` → C21
- [x] T8 — Verificación mecánica (comandos de `config.md`)
- [x] T9 — Verificación independiente (`spec-verifier`)
- [x] T10 — Archivar en `terminados/` y actualizar el índice
