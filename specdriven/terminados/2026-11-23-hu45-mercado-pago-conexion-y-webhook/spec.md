# HU45 — Conexión con Mercado Pago y webhook seguro · Spec

## Objetivo

Recibir y validar las notificaciones de Mercado Pago sin perder ni falsificar pagos.

## Requisitos

- R1: `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET` (en `.env.example`; guía en `docs/cobros-mercadopago.md`).
- R2: `MercadoPagoClient` (REST, timeout 15 s, 2 reintentos en red/5xx): preferencias, preapproval (crear/consultar/actualizar), pagos, pagos autorizados, búsqueda por `external_reference`, reembolsos.
- R3: `POST /billing/webhooks/mercadopago`: firma `x-signature` (HMAC-SHA256 de `id;request-id;ts`) → 401 y log si no vale; evento en `billing_events` con índice único `provider+eventId+type`; 200 inmediato; procesamiento aparte.
- R4: tipos `payment`, `subscription_preapproval`, `subscription_authorized_payment`; siempre se reconsulta la API.
- R5: reintento de eventos fallidos cada minuto (backoff, máx. 6) y conciliación horaria de pagos pendientes > 30 min.
- R6: `BillingHooks` para que HU47–HU50 reaccionen a cambios de pago y suscripción.

## Fuera de alcance

- Crear checkouts (HU46), alta de cuenta (HU47), estados de suscripción (HU48).

## Criterios de aceptación

| # | Requisito | Criterio | Prueba |
|---|---|---|---|
| C1 | R3 | Firma alterada → 401 y nada cambia | `mp-signature.spec.ts`, `mercadopago.e2e-spec.ts` |
| C2 | R3 | Mismo evento dos veces → se procesa una vez | e2e |
| C3 | R4 | Cuerpo dice approved, API dice rejected → rejected | e2e |
| C4 | R5 | Pago aprobado sin webhook se concilia en la siguiente corrida | e2e |
