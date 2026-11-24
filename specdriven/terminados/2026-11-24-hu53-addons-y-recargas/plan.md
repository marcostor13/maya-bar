# HU53 · Plan

- **Backend, `CheckoutSession`:** `kind: 'addon'`, `addonId`, `addonQty`.
- **`CheckoutService.createAddon`:** pago único con IGV, título propio y vencimiento.
- **`AddonsService`:** `list`, `quote` (prorrateo con `prorate`), `buy` y `apply` (idempotente vía el paso `planActivated` del alta).
- **`AccountProvisioningService`:** con `kind === 'addon'`, llama a `addons.apply` sin tocar plan ni periodo.
- **`addonsCost`:** se suma en `PlanChangeService` (opciones, subida, bajada y pendientes) y en la renovación de `SubscriptionLifecycleService`.
- **`PlanLimitsService.reserveCampaignEmails`:** reemplaza a `assertCanAdd` en el encolado de campañas.
- **Comprobante:** descripción para add-ons y para subidas (HU52).
- **Frontend:**
  - `AddonsPanelComponent` en Mi plan.
  - `PlanLimitDialog` lleva a `#addons`.
- **Pruebas:**
  - `test/addons.e2e-spec.ts`: C1, C2, permisos y recarga de emails.
  - `addons-panel.spec.ts`.
