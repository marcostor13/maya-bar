# HU61 — Plan

- `shared/svix-signature.ts` (+ unitarias).
- `resend-config.schema.ts`: `sealedWebhookSecret`, `trackingEnabled`, `lastWebhookAt`; `ResendService`: `webhookUrl`, `setWebhookSecret`, `webhookSecret`, `touchWebhook`, `enableTracking` (domains.update); rutas `PUT /resend/webhook-secret`, `POST /resend/tracking`.
- `campaign-recipient.schema.ts`: campos de seguimiento e índice por `providerId`.
- `campaigns/email-tracking.service.ts` (colección `email_events` con TTL para idempotencia; manejo de eventos; métricas; baja) y `resend-webhook.controller.ts`; `GET /campaigns/:id/email-metrics`; la baja marca al último destinatario.
- Suppression: fuentes `bounce` y `complaint`. Actividad de contacto `email_open`/`email_click`. Bus y motor HU58: disparadores `email_opened`/`email_clicked`.
- Frontend: métricas y "quién hizo clic" en el detalle de campaña; bloque de seguimiento en Resend; disparadores en el editor de automatizaciones; etiquetas en la bitácora.
