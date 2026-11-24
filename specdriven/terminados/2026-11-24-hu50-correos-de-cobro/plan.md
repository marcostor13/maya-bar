# HU50 — Plan

- `billing/emails/`:
  - `billing-email.templates.ts`: plantillas y `rejectReason`.
  - `billing-email.schema.ts`.
  - `billing-mailer.service.ts`: `send`, `trySend`, `wasSent`, `recipients`, `list` y `resend`.
  - `billing-notices.service.ts`: pendiente, rechazado, cobro mensual fallido, prueba y créditos.
- Se migran al mailer:
  - `AccountProvisioningService.sendAccess` (bienvenida o acceso) y el correo de pago confirmado.
  - `InvoicingService.sendEmail`.
  - `SubscriptionLifecycleService`: renovación y cobro mensual confirmado.
- `AiCreditsService.onUsage`.
- `MpPayment.transaction_details` (CIP).
