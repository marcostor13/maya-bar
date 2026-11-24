# HU57 · Plan
- Backend `src/billing-admin/`: `mrr.ts` (puro + spec), `admin-action.schema.ts`, `subscriptions-admin.service.ts`, `subscriptions-admin.controller.ts` (`/billing/admin/subscriptions`), `billing-admin.module.ts` (importa AuthModule por `AccountProvisioningService`).
- Exports: `InvoicingService` (BillingModule), `AccountProvisioningService` (AuthModule); `BillingMailer.idByKey`, `InvoicingService.emailReceipt`.
- Frontend: `pages/admin/billing-admin.ts` (pestañas, resumen, lista), `subscription-detail.ts` (ficha con app-form-page, modales, pago manual a pantalla completa), `coupons-admin.ts`, `billing-queues.ts`, `billing-admin.shared.ts`; ruta y menú.
- Pruebas: `mrr.spec.ts` (2), `test/subscriptions-admin.e2e-spec.ts` (5), `billing-admin.spec.ts` (6).
