# HU52 — Plan

- `plans.catalog.ts`: `PLAN_RANK` y `prorate()`.
- `plan-change.service.ts`:
  - Opciones, subir, bajar, deshacer la bajada, cancelar y reactivar.
  - `applyUpgrade`, `applyPending`, `settleUsers`.
  - Crons `endCanceled` y `syncPreapprovalAmounts`.
- `plan-change.controller.ts`.
- `checkout.service.createUpgrade` y `kind` en la sesión.
- `account-provisioning`: con `kind = upgrade` aplica la subida; tras `activatePlan`, `settleUsers`.
- `tenants.activatePlan`: limpia `pendingPlan` y la cancelación.
- `subscription-lifecycle`:
  - `applyPending` en el cobro mensual.
  - `markPastDue` y los avisos de renovación ignoran `cancelAtPeriodEnd`.
- Esquemas:
  - Tenant: `cancelReason`, `canceledAt`, `pendingKeepUsers`, `preapprovalAmountTarget`.
  - User: `deactivatedByPlan`.
- Frontend: `plan-change-panel.ts` dentro de `my-plan.ts`.
