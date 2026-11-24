# HU48 — Ciclo de vida de la suscripción y renovaciones · Spec

## Objetivo

Cada suscripción sigue sola su estado y se renueva sin trabajo manual.

## Decisión de diseño

La suscripción sigue en `tenant.subscription` (decidido en HU41), no en una colección aparte. Ahí van plan, periodo, moneda, precio pactado (`amount`), estado, `currentPeriodEnd`, `mpPreapprovalId`, `graceEndsAt`, `pendingPlan` y `renewalNoticeFor`. Los cobros están en `payments` (HU44/HU45). Una sola fuente de verdad evita desincronizar dos colecciones.

## Requisitos

- R1: **mensual automático.** Cada cobro aprobado del preapproval que no sea el primero (el primero lo activa HU47) cumple esto:
  - Hace avanzar `currentPeriodEnd` exactamente un mes desde el fin vigente.
  - Deja la suscripción `active` y quita la gracia.
  - Marca el pago `periodApplied` con su `tenantId` y `kind: renewal`.
  - El reclamo es atómico: un mismo cobro nunca hace avanzar el periodo dos veces.
- R2: **trimestral o anual.** Una vez por hora se revisan los planes activos que vencen en ≤ 7 días.
  - A cada uno se le crea una compra de renovación (Checkout Pro) al **precio pactado**, con el IGV.
  - Se manda un correo con el enlace de pago, una sola vez por periodo (`renewalNoticeFor`).
  - Al pagarla, el alta (HU47, rama `account`) suma el periodo desde el fin vigente.
- R3: un periodo vencido sin cobro pasa a `past_due` con 3 días de gracia por defecto (HU51 la ajusta). Para el mensual hay 2 días de margen, porque Mercado Pago cobra el mismo día del vencimiento.
- R4: `canUse(tenant)` une la suspensión manual (HU16) y el estado de cobro (`accessOf`).

## Criterios de aceptación

| # | Criterio | Prueba |
|---|---|---|
| C1 | Un cobro mensual aprobado hace avanzar `currentPeriodEnd` exactamente un mes y crea su `payment` (el comprobante llega en HU49) | `subscription-lifecycle.e2e-spec.ts` |
| C2 | Si el catálogo cambia de precio, se sigue cobrando el precio pactado | ídem |
| C3 | El aviso de renovación anual sale 7 días antes, una sola vez | ídem |
