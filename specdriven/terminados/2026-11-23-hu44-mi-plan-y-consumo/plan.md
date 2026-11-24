# HU44 — Mi plan y consumo · Plan técnico

## Diseño

- **Datos**: colección `payments` (`backend/src/billing/payment.schema.ts`: concepto, monto, moneda, estado, `providerPaymentId` único, `paidAt`, `receipt` PDF/XML); `Tenant.billingInfo`.
- **API** (`billing.controller.ts`, `ADMIN_ONLY`): `GET /billing/usage` (límites efectivos + `usage()` + saldo de créditos), `GET /billing/payments` (100 últimos de la empresa), `GET/PUT /billing/info` (`BillingInfoDto` + `docNumberError`: boleta DNI 8, factura RUC 11 con prefijo 10/15/17/20 y dirección).
- **Front**: `pages/settings/my-plan.ts` en `/settings/plan` (`moduleGuard('settings')` + `roleGuard('TENANT_ADMIN')`); acceso desde Configuración. `UPGRADE_ROUTE` → `/settings/plan`; el diálogo de límite y el aviso de prueba ocultan los botones a quien no es admin.
- **Móvil**: tarjetas a ancho completo, pagos como lista que envuelve, formulario de una columna < 768 px.

## Seguridad

Todo por `tenantId` del JWT; pagos filtrados por empresa (e2e con un pago ajeno).

## Estrategia de pruebas

- `frontend/src/app/pages/settings/my-plan.spec.ts`, `shared/plan-limit.spec.ts` (no admin).
- `backend/test/my-plan.e2e-spec.ts` (C1, C2, C3, C5).
