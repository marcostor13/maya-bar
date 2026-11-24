# HU45 — Mercado Pago · Plan técnico

## Diseño

- `billing/mercadopago/mercadopago.client.ts`, `mp-signature.ts`.
- `billing/billing-event.schema.ts` (`billing_events`), `billing-events.service.ts` (`enqueue`, `process`, cron `drain` cada minuto).
- `billing/payments.service.ts`: `syncFromMp` (estado de la API → `payments`; enlaza el pendiente del checkout por `externalReference`; tenant desde `metadata.tenant_id`) y cron `reconcile` horario. `mapMpStatus`.
- `billing/billing-hooks.service.ts`: suscriptores de cambios de pago y de suscripción.
- `billing/mercadopago-webhook.controller.ts`.
- `Payment`: `tenantId` opcional (alta nueva, HU47), `externalReference`, `kind`, `mpPreapprovalId`, `statusDetail`, `metadata`.

## Seguridad

Firma con `timingSafeEqual`; sin secreto configurado se rechaza todo. El cuerpo no cambia estados.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Webhook perdido | Conciliación horaria |
| MP caído al procesar | Evento pendiente con backoff |
| Suscriptor de hook falla | El evento se reintenta; los suscriptores deben ser idempotentes |

## Pruebas

`mp-signature.spec.ts`, `backend/test/mercadopago.e2e-spec.ts` (cliente MP simulado con `jest.spyOn`).
