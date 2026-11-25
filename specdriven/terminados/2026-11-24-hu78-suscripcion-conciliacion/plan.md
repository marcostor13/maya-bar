# HU78 · Plan
- `CheckoutReconcileService` (nuevo, cron 10 min) usando `MercadoPagoClient.searchAuthorizedPayments` (nuevo, `GET /authorized_payments/search`), `searchPayments`, `PaymentsService.syncFromMp` y `BillingHooks.emitPreapproval`.
- `SubscriptionLifecycleService.onPreapprovalCancelled` vía `hooks.onPreapproval`.
- `PlanChangeService.reactivate`: captura el rechazo de Mercado Pago → 400.
