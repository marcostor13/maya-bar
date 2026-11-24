# HU46 — Checkout · Plan técnico

## Diseño

- Backend: `billing/ruc.ts`, `checkout-session.schema.ts`, `dto/checkout.dto.ts`, `checkout.service.ts` (`quoteFor`, `create`, `status`, suscripción a `BillingHooks.onPayment/onPreapproval` → `paid`/`awaiting_payment`/`rejected`), `checkout.controller.ts` (público y de cuenta). `Payment.paymentType`. `docNumberError` usa el dígito verificador del RUC.
- Frontend: `pages/checkout/checkout.ts` (formulario reactivo + señal de repintado, Turnstile solo sin sesión), `checkout-result.ts` (sondeo), `ruc.ts`; rutas públicas `/checkout` y `/checkout/resultado`; enlace "o paga ahora" en la landing y "Elegir y pagar plan" en Mi plan.

## Seguridad

- Id público de 18 bytes aleatorios; el estado público no expone datos del comprador.
- Turnstile + throttling en el alta pública; en la cuenta, solo `TENANT_ADMIN`.
- Idempotencia `checkout-<id>` al crear en Mercado Pago.

## Pruebas

- `backend/src/billing/checkout.spec.ts`, `backend/test/checkout.e2e-spec.ts`, `frontend/src/app/pages/checkout/checkout.spec.ts`.
