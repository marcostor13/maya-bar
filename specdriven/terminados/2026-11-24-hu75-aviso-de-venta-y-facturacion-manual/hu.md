# HU75 — Aviso de cada venta y facturación manual

## Historia

**Como** dueño de Maya,
**quiero** recibir un correo en admin@ignia.site cada vez que alguien compra, con todos los datos para facturar, y que por ahora Maya no emita boletas ni facturas sola,
**para** emitir yo los comprobantes a mano mientras la facturación automática (Nubefact) queda pendiente.

## Contexto (estado actual)

- Al aprobarse un pago, `InvoicingService.onPayment` deja el comprobante en cola y un cron lo emite con Nubefact (HU49). Nubefact no está configurado en producción: los comprobantes quedarían "en cola" para siempre.
- Al superadmin solo le llegan avisos de casos raros (alta con correo ya usado, implementación pagada). No hay aviso de cada venta.

## Propuesta

1. Correo "Nueva venta" a `SALES_NOTIFY_EMAIL` (por defecto `admin@ignia.site`) en cada pago aprobado: plan o compra, monto, medio de pago, id de Mercado Pago, empresa, comprador y datos de facturación (boleta/factura, documento, razón social, dirección, correo).
2. Facturación automática apagada salvo que `INVOICING_AUTO=true`: el comprobante queda "Por facturar (manual)".
3. En Facturación del superadmin, pestaña "Por facturar" con esos pagos y un botón "Marcar facturado" (con la serie y número opcionales).
