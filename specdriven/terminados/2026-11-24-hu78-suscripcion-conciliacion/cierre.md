# HU78 · Cierre

Fecha: 2026-11-24 · Verificador: spec-verifier, 4/4 CUMPLE.

- Cron `CheckoutReconcileService` (cada 10 min): compras `pending`/`awaiting_payment` de 10 min a 7 días; la mensual se revisa por su preapproval y sus cobros autorizados (`GET /authorized_payments/search`), y el pago único y la implementación por `external_reference`.
- Si el preapproval de una suscripción activa llega `cancelled`, queda `cancelAtPeriodEnd` con motivo "Cancelada desde Mercado Pago".
- Reactivar: 400 "Vuelve a elegir tu plan" solo si Mercado Pago confirma `cancelled`; cualquier otro fallo da 503 (hallazgo medio del verificador, corregido).
- Pruebas: e2e `checkout-reconcile` 4/4; e2e completo 306/306; unitarias 1819/1819 (corridas por el verificador). Dos unitarias de correo fallaron por tiempo de espera solo mientras corría el e2e en paralelo.
- Producción (antes del cambio): 2 compras mensuales pendientes, ningún webhook de Mercado Pago recibido; una notificación firmada de prueba se procesó bien.
- Hallazgos bajos corregidos (25-11): tras cancelar en Mercado Pago, "Mi plan" ofrece "Volver a suscribirme" (al checkout) en lugar de "Reactivar" (`canceledInMp` en `/billing/plan/options`); en impago, cancelar en Mercado Pago cierra la suscripción ya; una compra mensual cuyo preapproval se cancela antes de pagar queda `rejected` y deja de consultarse. e2e `checkout-reconcile` 6/6 y suites de facturación 24/24; prueba del panel 5/5.
