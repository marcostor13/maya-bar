# HU76 — Plan

1. `frontend/src/app/shared/payment-logos.data.ts`: trazos SVG (Simple Icons)
   de Mercado Pago, Visa, Mastercard, American Express y Diners.
2. `frontend/src/app/shared/payment-logos.ts`: componente `app-payment-logos`
   (`cardsOnly`, `compact`).
3. `frontend/src/app/pages/checkout/checkout.ts`: plantilla y estilos nuevos
   (áreas de grid config/summary/form, resumen fijo, barra móvil con
   `form="checkout-form"`), `planOptions`, `periodName`, `periodSave`,
   `payAmount`, `couponOpen`. Sin cambios en la lógica de cotización y pago.
4. `frontend/src/app/pages/checkout/checkout-result.ts`: logo, resumen y sello.
5. Pruebas en `checkout.spec.ts`.
