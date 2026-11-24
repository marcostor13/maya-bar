# HU48 — Plan

- `billing/subscription-lifecycle.service.ts`:
  - `onRecurringPayment`, enganchado a `BillingHooks.onPayment`.
  - Crons horarios `sendRenewalNotices` y `markPastDue`.
  - Función `addMonths`, que no se pasa del fin de mes.
- `CheckoutService.createRenewal` usa el precio pactado. `create()` se separó en `open()`, que se reutiliza.
- `Payment.periodApplied`, `TenantSubscription.renewalNoticeFor` y `canUse()` en `subscription-access.ts`.
- `TenantsService.activatePlan` invalida la caché de acceso.
- `BillingModule` importa `MailModule` y el modelo `User`.
