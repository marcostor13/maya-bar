# HU55 · Plan

## Backend
- **Catálogo:** `setup.catalog.ts` con `setupQuote`.
- **`CheckoutService`:**
  - `withSetup` en las cotizaciones y en `open`.
  - Segundo ítem en la preferencia de pago único, o preferencia aparte `:setup` en mensual.
  - `markSetupPaid` (condicional) y el hook `onSetupPaid`.
  - `status()` devuelve `setup`.
- **Sesión:** `setup` en `CheckoutSession`; DTO con `setup`.
- **`billing/onboarding/`:** esquema, servicio (tarea idempotente y correos con el mailer de HU50) y controlador de superadmin.
- **Facturación:** `InvoiceRequest.lines`; Nubefact arma los ítems desde las líneas; `invoicing` separa el plan y la implementación.

## Frontend
- Selector y líneas en el checkout.
- Botón "Pagar …" en el resultado.
- Página `/admin/onboarding`, ruta y menú.
- Textos de la landing.

## Pruebas
- `test/onboarding.e2e-spec.ts` (3).
- `onboarding.spec.ts` (2).
- `checkout.spec.ts` (+1).
