# HU15 — Webhook de salida · Plan técnico

## Estado actual

- Los cambios de estado pasan por `ConversationsService.handleAck`,
  `finishDelivery`, `sendExternal` y el reintento (HU7); todos publican por
  `ConversationsGateway.emitMessageUpdated`. Los entrantes, por `emitMessage`.
- `ApiAccess` (HU13) no tiene URL de aviso.

## Diseño

- **Eventos internos:** `MessageEvents` (EventEmitter) en `conversations/`,
  inyectado (opcional) en el gateway: `emitMessage` → `created`,
  `emitMessageUpdated` → `updated`. Un solo punto, sin tocar cada flujo.
- **Datos:** `ApiAccess.webhookUrl`, `webhookSecret` (cifrado con `SecretBox`).
  Colección `api_webhook_deliveries` (bandeja de salida): accessId, tenantId,
  event, refId, payload, status `pending|delivered|failed`, attempts,
  nextAttemptAt, lastStatus, lastError, deliveredAt, createdAt (TTL 30 días).
  Índice único `(accessId, refId, event)` = idempotencia.
- **API:** `PUT /api-access/:id/webhook {url}`, `DELETE …/webhook`,
  `POST …/webhook/rotate`, `POST …/webhook/test`, `GET …/webhook/deliveries`.
- **Trabajador:** `ApiWebhookService` (intento inmediato + `@Cron` cada 30 s,
  reclamo atómico con `findOneAndUpdate`).
- **Interfaz:** en el formulario del acceso, sección «Avisos a tu sistema»;
  en la tarjeta, botón «Avisos» que abre un modal con los últimos 20 y «Enviar prueba».

## Seguridad

HMAC-SHA256 con marca de tiempo (anti-replay del lado del receptor),
`assertPublicHost` en cada envío (DNS rebinding), `redirect: 'error'`,
timeout 10 s, secreto cifrado y mostrado una vez.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Ack duplicado → aviso duplicado | Índice único |
| Receptor caído | Reintentos con espera creciente, máximo 6 |
| Dos instancias del trabajador | Reclamo atómico (bloqueo de 2 min) |

## Estrategia de pruebas

Unitarias de `ApiWebhookService`; e2e de API con `fetch` simulado;
unitaria de la pantalla.

## Fases

1. Todo en una entrega.
