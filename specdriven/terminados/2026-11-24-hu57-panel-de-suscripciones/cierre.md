# Cierre HU57 — Panel de suscripciones e ingresos (superadmin)

## Qué quedó
- Backend `src/billing-admin/`: resumen (MRR normalizado a mensual por moneda, nuevos, bajas reales, churn, cancelaciones programadas, conversión de prueba, impagos, ingresos del mes), lista con filtros y páginas de 50, ficha, alargar prueba, cambiar plan con precio pactado, pago manual con comprobante, reembolso total (Mercado Pago o manual) con nota de crédito, reenvío de acceso y de comprobante/NC. Bitácora `billing_admin_actions`.
- Frontend `/admin/billing` (solo SUPERADMIN): pestañas Resumen, Suscripciones, Cupones, Comprobantes y Correos; ficha a pantalla completa con pagos, comprobantes, notas de crédito y bitácora con detalle.

## Verificación
- spec-verifier: 2 CUMPLE, 1 PARCIAL. Hallazgos corregidos:
  - A1 pago manual a un plan menor: se aplica ya con el monto pagado (sin bajada programada al precio de catálogo).
  - A2 pago manual idempotente con `requestId` por formulario.
  - A3/M1 bajas reales (canceladas + caídas por impago al vencer la gracia), las programadas aparte; conversión solo de cuentas con prueba y sin pagos reembolsados.
  - M2 precio > 0 en cambio de plan; M3 si falla la activación se borra el pago; M4 periodo del comprobante en renovaciones adelantadas.
  - M5/B3 reembolso con motivo obligatorio (modal), candado contra doble reembolso (409), botones deshabilitados mientras se procesa, detalles en la bitácora; B2 texto correcto para USD.
- Pruebas: `mrr.spec.ts` (2), `test/subscriptions-admin.e2e-spec.ts` (8), `billing-admin.spec.ts` (6). Backend unit 1779, e2e de cobros 34, builds OK.

## Pendiente fuera de alcance
- Tras un reembolso la suscripción sigue activa (decisión de la spec).
- Filtro "por periodo" = periodo de facturación, no rango de fechas.
