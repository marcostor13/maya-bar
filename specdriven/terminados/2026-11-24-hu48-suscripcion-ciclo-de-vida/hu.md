# HU48 — Ciclo de vida de la suscripción y renovaciones

## Historia

**Como** dueño de Maya,
**quiero** que cada suscripción siga sola su estado (prueba, activa, pago pendiente, vencida o cancelada) y se renueve,
**para** cobrar cada periodo sin hacer nada a mano.

## Contexto (estado actual)

- Solo existe `tenant.isActive` (suspensión manual, HU16) y `planExpiresAt` sin usar.

## Propuesta

1. Colección `subscriptions`, una por empresa, con:
   - Plan, periodo y moneda.
   - **Precio pactado**, que no cambia si cambia el catálogo.
   - Cupón, add-ons e IDs de Mercado Pago (`preapprovalId`, `payerId`).
   - Estado: `trialing | active | past_due | expired | canceled`.
   - `currentPeriodStart/End`, `cancelAtPeriodEnd` e historial de cambios.
2. Colección `payments`: una por cobro, con el monto, el IGV, el estado de Mercado Pago, el método y el enlace al comprobante.
3. **Mensual automático**: con cada `subscription_authorized_payment` aprobado se registra el pago, el periodo avanza un mes y se emite el comprobante.
4. **Trimestral o anual (pago único)**:
   - 7 días antes del fin del periodo, correo con un enlace de pago de la renovación (HU50).
   - Si se paga, el periodo avanza. Si no, al vencer pasa a `past_due` (HU51).
5. La función `canUse(tenant)` reúne el estado de la suscripción y la suspensión manual; la usan los guards de HU41, HU42 y HU51.

## Criterios de aceptación (borrador)

- C1: un cobro mensual aprobado avanza `currentPeriodEnd` exactamente un mes y crea un `payment` con su comprobante.
- C2: si el catálogo cambia de precio, una suscripción existente sigue cobrando su precio pactado.
- C3: el aviso de renovación anual sale 7 días antes, una sola vez.
