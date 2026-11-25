# HU75 — Aviso de cada venta y facturación manual · Plan técnico

## Estado actual

- `backend/src/billing/invoicing/invoicing.service.ts` `onPayment`: aprobado → `receipt.status = pending` + `kick`.
- `backend/src/billing/emails/billing-notices.service.ts`: avisos al cliente por pago pendiente/rechazado (hook `onPayment`).
- `backend/src/billing/emails/billing-mailer.service.ts`: `trySend` con clave única y bitácora.
- `backend/src/billing/billing.controller.ts`: `GET admin/receipts`, `POST admin/receipts/:id/retry` (solo SUPERADMIN).
- `frontend/src/app/pages/admin/billing-queues.ts`: pestañas "Con error" y "En cola".

## Diseño

- **Datos**: `ReceiptStatus` suma `manual`. Sin migración.
- **Config**: `SALES_NOTIFY_EMAIL` (por defecto `admin@ignia.site`), `INVOICING_AUTO` (por defecto apagado).
- **Backend**:
  - `BillingNoticesService.onPayment`: aprobado y `previousStatus !== approved` → `T.saleAlert` con clave `sale:<providerPaymentId|_id>`. Datos de la compra (`externalReference`) o, en renovaciones, de la primera compra de la suscripción (`mpPreapprovalId`); empresa por `tenantId` o el nombre de la compra.
  - `InvoicingService.onPayment`: sin `INVOICING_AUTO=true` → `receipt.status = manual`, sin `kick`.
  - `InvoicingService.queue('manual')` y `markInvoiced(paymentId, reference?)`: `manual` → `skipped` con `skippedReason = "Facturado a mano[: ref]"`; si no está en `manual`, 400.
  - Controlador: `status=manual` en la cola; `POST admin/receipts/:id/invoiced` `{ reference? }`.
- **Interfaz**: pestaña "Por facturar" (primera) en Comprobantes; por fila, campo opcional "Serie-número" y botón "Marcar facturado"; toast de éxito y de error.

## Seguridad

Solo SUPERADMIN (mismo `superadmin(req)`). La referencia se limita a 40 caracteres. El correo sale solo a direcciones de configuración, nunca a datos del webhook.

## Observabilidad

Bitácora `billing_emails` (tipo `sale`) con reenvío desde el panel; errores en el log.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Correos duplicados por reintentos del webhook | clave única en la bitácora |
| Olvidar facturar | pestaña "Por facturar" lista lo pendiente |

## Estrategia de pruebas

- e2e de API `backend/test/sale-notice.e2e-spec.ts` (C1, C2, C3, C5).
- Unitaria `invoicing.service` (C4) y frontend `billing-queues.spec.ts` (C6).

## Fases

1. Backend + pruebas. 2. Panel. 3. Documento para el usuario.

## ADRs

- No aplica.
