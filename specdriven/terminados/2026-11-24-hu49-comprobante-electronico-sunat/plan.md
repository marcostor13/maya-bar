# HU49 — Plan

- `billing/invoicing/`:
  - `invoice-provider.ts`: interfaz, `INVOICE_PROVIDER` y `splitIgv`.
  - `nubefact.provider.ts`: `body()` público para las pruebas, `issue` y `find` (`consultar_comprobante`).
  - `invoice-counter.schema.ts`.
  - `invoicing.service.ts`:
    - Hook `onPayment`, `drain` en cron y `processOne`.
    - Reclamo con `lockedUntil`; `build`, `sendEmail`, `queue` y `retry`.
- `Payment.receipt`: `ReceiptDoc` con estado, intentos y nota de crédito.
- `BillingController`: cola y reintento solo para el SUPERADMIN de verdad. `ai-usage` ahora usa la misma comprobación: `assertRole` dejaba pasar a los roles propios.
