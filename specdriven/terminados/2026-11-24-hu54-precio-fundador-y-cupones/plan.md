# HU54 · Plan

## Backend
- `billing/coupons/`:
  - `coupon.schema.ts`.
  - `coupon-math.ts`: `discountAmount`, `discounted`, `discountEndsAt`.
  - `coupons.service.ts`: alta del fundador; `check`, `reserve`, `release` y `reclaim`; `remaining`; crons `releaseExpired` y `expireDiscounts`; CRUD.
  - `coupon.dto.ts`.
- `agreed-price.ts`: precio pactado = plan con descuento + add-ons. Se usa en `PlanChangeService` y en la renovación.
- `CheckoutService`: `withCoupon`, `quoteWithCoupon`, `quoteForAccount`; reserva en `create`; `coupon` guardado en la sesión.
- Alta de la cuenta: `activatePlan(..., coupon)` guarda `subscription.discount`; `reclaim` si el pago llega tarde.
- Comprobante: `InvoiceRequest.discount`; Nubefact con `descuento` y `total_descuento`.

## Frontend
- Checkout: campo de cupón, línea de descuento y motivo cuando no aplica.
- Landing: aviso de cupos fundador.

## Pruebas
- `coupon-math.spec.ts` (4).
- `test/coupons.e2e-spec.ts` (7).
- `checkout.spec.ts` (cupón).
