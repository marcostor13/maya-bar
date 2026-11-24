# HU51 — Plan

- `tenant.schema.ts`: `subscription.pastDueSince`.
- `subscription-lifecycle.service.ts`:
  - `recurringTenant()`, compartido con HU48.
  - `onRecurringRejected`.
  - Gracia de 7 días.
  - Se limpia `pastDueSince` al pagar (también en `tenants.service.activatePlan`).
- `past-due.service.ts`: `notify`, `reminders` (días 0, 3 y 6) y `longExpired` (60 días, al superadmin).
- Plantillas: `monthlyFailed` ("Actualizar medio de pago") y `longExpired`.
- `billing-notices.service.ts`: no duplica avisos en los cobros recurrentes.
- Frontend: `trial-banner.ts` con el estado `past_due` y el botón "Actualizar medio de pago" hacia `/checkout`.
