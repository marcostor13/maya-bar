# HU48 — Ciclo de vida de la suscripción y renovaciones · Cierre

- **Cerrada:** 2026-11-24
- **Estado:** Terminada
- **Verificación (spec-verifier):** 2 CUMPLE y 1 PARCIAL (C1: el comprobante corresponde a HU49). Corregido:
  - **Avance atómico del periodo:** una sola escritura condicionada al fin leído, con `appliedPayments`. Ya no se pierde un mes si falla a mitad, ni con dos cobros a la vez.
  - **`canUse` conectado:** `BillingAccessService.canOperate` ahora tiene en cuenta la suspensión manual.
  - **Lote de avisos:** excluye a los ya avisados.
  - **Plan pendiente (HU52):** se cobra al precio del plan nuevo.
  - **`activatePlan`:** usa `addMonths` (sin desbordar el fin de mes) y suma desde el fin vigente también si se paga en `past_due`.
  - **Pruebas nuevas:** cobros paralelos y margen mensual.
- **Commits:** sin commit

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Un cobro mensual hace avanzar el periodo exactamente un mes y crea su `payment` | CUMPLE (el comprobante, en HU49) | `backend/test/subscription-lifecycle.e2e-spec.ts` |
| C2 | Se cobra el precio pactado aunque cambie el catálogo | CUMPLE | ídem |
| C3 | El aviso anual sale 7 días antes, una sola vez | CUMPLE | ídem |

## Qué se implementó

- `SubscriptionLifecycleService`: cobro recurrente, avisos de renovación con enlace de pago y paso a `past_due` con 3 días de gracia.
- `CheckoutService.createRenewal`, `canUse()` y `addMonths()`, ahora en `plans.catalog.ts`.

## Pendientes, riesgos y notas

- Renovación sin datos de facturación: sale boleta con `docNumber` vacío; HU49 debe emitirla como "cliente varios".
- Si todos los intentos de aviso fallan hasta el vencimiento, el enlace llega con HU51 (impago).
- La suscripción reactiva una cancelada si Mercado Pago llega a cobrar; HU52 define la cancelación.
