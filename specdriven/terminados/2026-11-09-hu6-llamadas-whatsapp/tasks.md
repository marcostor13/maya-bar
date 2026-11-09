# HU6 — Llamadas de WhatsApp · Tareas

Tareas pequeñas, por orden de dependencia. Marcar `[x]` solo con la prueba en
verde.

## Fase 1 — Seguridad base

- [x] T1 — `rawBody` en `main.ts` y en el `createApp` de e2e. `verifyMetaSignature` (HMAC-SHA256 + `timingSafeEqual`) en el webhook, en la URL de app y la URL por cuenta, y `waAppSecret` (`select:false`) en la cuenta. → C13 · prueba: unitaria de la firma + e2e de firma inválida
- [x] T2 — Gateway con JWT: verifica el token del handshake con `ActiveUserCache`, crea las salas `tenant:`, `user:` y `calls:` y emite a `tenant:`. El cliente envía el token (`auth`). → C1, C11 · prueba: unitaria del gateway + specs de `conversations-realtime` + e2e de bandeja

## Fase 2 — Backend de llamadas

- [x] T3 — Módulo `calls` en `modules.catalog` (con roles por defecto), categoría de push `calls` y `maskPhone`. → C11 · prueba: unitaria del catálogo y la audiencia
- [x] T4 — Esquemas `Call` y `CallPermission`, y `calling` en `WhatsAppAccount`. → C8 · prueba: compilación + unitarias del servicio
- [x] T5 — `CallsMetaService`: acciones, `connect`, `settings`, `call_permissions` y solicitud de permiso, con la versión de Graph configurable. → C7, C10 · prueba: unitaria de las formas de petición
- [x] T6 — `CallsService` entrante: `ringing`, bloqueado, reserva atómica, liberar, aceptar, rechazar, colgar, `terminate`, tiempo de espera con barrido y respuesta automática. → C1, C3, C4, C6 · prueba: unitarias con reloj controlado
- [x] T7 — `CallsService` saliente y permisos: estado del permiso, solicitud, respuesta del webhook, `outbound` y estados `RINGING`, `ACCEPTED` y `REJECTED`. → C7 · prueba: unitarias
- [x] T8 — Registro al terminar: actividad `call` en la ficha y nota en el chat (métodos públicos en `ConversationsService`), idempotente con `logged`. → C9 · prueba: unitaria + e2e
- [x] T9 — Webhook: rama `calls`, `statuses` con `type: call` y `interactive.call_permission_reply`; los eventos de llamadas solo se aceptan con firma verificada. → C1, C13 · prueba: unitaria del parseo
- [x] T10 — `CallsController` (historial con filtros, `claim`, `release`, `accept`, `reject`, `hangup`, permiso, `outbound`, `settings` y `stats`) y KPIs del panel. → C8, C10, C11, C16 · prueba: e2e de API
- [x] T11 — e2e de API `calls.e2e-spec.ts`: entrante con aviso por socket, doble reserva, perdida con respuesta automática, bloqueado, repetido, firma inválida, saliente, aislamiento y 403. → C1, C3, C4, C6–C9, C11, C13

## Fase 3 — Frontend

- [x] T12 — `CallsService` (WebRTC, estados, micrófono denegado, silenciar, colgar, cronómetro) y `CallOverlayComponent` en el shell. → C1, C4, C12 · prueba: unitarias
- [x] T13 — Página `/llamadas`: ruta con `moduleGuard('calls')`, menú, historial con filtros, paginación y estados, y acciones (devolver, ficha, chat). `?view=` en clientes. → C8, C11 · prueba: unitaria
- [x] T14 — `CallDialogComponent` y botón "Llamar" en la ficha, el chat y el historial. → C7 · prueba: unitaria
- [x] T15 — Configuración "Llamadas" por cuenta en `whatsapp-settings`. → C10 · prueba: unitaria
- [x] T16 — Tiles del panel. → C16 · prueba: unitaria
- [x] T17 — Manifiesto de Android: `RECORD_AUDIO` y `MODIFY_AUDIO_SETTINGS` (ya estaban; el WebView concede el micrófono).

## Fase 4 — Cierre

- [x] T18 — e2e de navegador `calls.e2e.ts`: historial con filtros, y aviso entrante con WebRTC simulado (aceptar y colgar). → C8, C12, C14
- [x] T19 — `docs/llamadas-whatsapp.md`: activación en Meta, suscripción `calls`, secretos, prueba manual C2/C5. Variables nuevas en `.env.example`.
- [x] T20 — Verificación mecánica: `npm run verify`. → C15
- [x] T21 — Verificación independiente: `spec-verifier` no se pudo lanzar (bloqueado por el hook de context-mode); autoverificación en `cierre.md`.
- [x] T22 — Archivar en `terminados/` y actualizar el índice.
