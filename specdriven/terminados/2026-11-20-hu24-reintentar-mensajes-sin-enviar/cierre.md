# HU24 — Reintentar mensajes que no se enviaron · Cierre

- **Cerrada:** 2026-11-20
- **Estado:** Terminada con pendientes del usuario (prueba en la app móvil)
- **Verificación (spec-verifier):** 7 CUMPLE · C8 CUMPLE (`npm run verify`) · C9 [usuario]: el bloqueo que señaló el verificador (la cola no se vaciaba al abrir la app) está corregido · hallazgos alto y medios corregidos
- **Commits:** ver historial de `develop` (HU24)

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | `clientId` idempotente, 409 en otro chat, 400 inválido | CUMPLE | `conversations.service.ts` `findByClientId`/`sendManual`, índice en `message.schema.ts`, `test/inbox-retry.e2e-spec.ts` |
| C2 | Reintento atómico, repetible, sin mensajes nuevos | CUMPLE | `retryMessage`, e2e C2 |
| C3 | No se reintentan enviados, de la API ni de otra empresa | CUMPLE | filtro de `retryMessage`, e2e C3 |
| C4 | Cola persistente | CUMPLE | `shared/outbox.ts`, `outbox.spec.ts` |
| C5 | Sin red queda en cola y sale en orden | CUMPLE | `flush`, `isNetworkError` (0/502/503/504/timeout), vaciado en el shell al abrir la app, `outbox.spec.ts` |
| C6 | Rechazo → fallido; reintento con el mismo `clientId` | CUMPLE | `outbox.ts` `retry`, `outbox.spec.ts` |
| C7 | "Sin conexión", Reintentar y Descartar en la bandeja | CUMPLE (revisión de código) | `pages/inbox/inbox.ts` |
| C8 | `npm run verify` | CUMPLE | lint, builds, unitarias backend 1669/1669, e2e de API 123/123, unitarias frontend 864/864, e2e de navegador 24/24 |
| C9 | Prueba en el móvil | [usuario] | — |

## Qué se implementó

- Backend: `Message.clientId` (índice único parcial por empresa); `sendManual` idempotente; `POST /conversations/:id/messages/:messageId/retry` (solo escritos a mano en la bandeja, cambio atómico a `pending`, sin reintento automático posterior).
- Frontend: `OutboxService` (cola por usuario en `localStorage`), vaciado en orden al abrir la app (shell), al volver la red y al reconectar; fallos de red, 502/503/504 y 30 s sin respuesta dejan el mensaje en cola; rechazos, fallidos con Reintentar y Descartar (con confirmación).
- Bandeja: todo envío pasa por la cola; burbujas `tmp-<clientId>` emparejadas por `clientId`; estado "Sin conexión · se enviará al volver la red".

## Lo que tiene que hacer el usuario

- C9: en la app móvil, modo avión → escribir un mensaje → cerrar la app → quitar el modo avión y abrirla: el mensaje sale una sola vez.

## Pendientes, riesgos y notas

- Un adjunto no se puede subir sin red (la subida ocurre al adjuntar).
- Si un mensaje se rechaza, la tanda sigue con los siguientes (no bloquea la cola).
- El texto de la cola queda en el dispositivo aunque se cierre sesión (se envía al volver a entrar con ese usuario).
- Reintentar uno que Meta sí recibió pero informó como fallido puede duplicarlo en el cliente (inherente).
