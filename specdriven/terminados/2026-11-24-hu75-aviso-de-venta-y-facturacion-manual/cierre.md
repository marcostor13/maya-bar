# HU75 — Aviso de cada venta y facturación manual · Cierre

- **Cerrada:** 2026-11-24
- **Estado:** Terminada (prueba real del usuario pendiente)
- **Verificación (spec-verifier):** 5 CUMPLE · 1 PARCIAL · 1 [usuario]; C4 y el reembolso corregidos después
- **Commits:** ver `git log` (commit de HU74–HU77)

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Correo "Nueva venta" con todos los datos | CUMPLE | `billing-notices.service.ts` `saleAlert`, `test/sale-notice.e2e-spec.ts` |
| C2 | Una sola vez por pago | CUMPLE | clave `sale:<id>` en `billing_emails`; e2e |
| C3 | Sin `INVOICING_AUTO` queda `manual` y no se llama a Nubefact | CUMPLE | `invoicing.service.ts` `onPayment`; e2e + `invoicing.service.spec.ts` |
| C4 | Con `INVOICING_AUTO=true` HU49 no cambia | CUMPLE (tras corrección) | `invoicing.service.spec.ts` + `invoicing.e2e-spec.ts` |
| C5 | Listar y marcar facturado, solo superadmin | CUMPLE | `billing.controller.ts`, e2e (403/201/400) |
| C6 | Pestaña "Por facturar" | PARCIAL (sin prueba del camino de error) | `billing-queues.ts`, `billing-admin.spec.ts` |
| C7 | Llega el correo en una compra real | [usuario] | `docs/activar-compras-mercadopago.md` §5 y §7 |

## Qué se implementó

- Correo "Nueva venta" a `SALES_NOTIFY_EMAIL` (por defecto admin@ignia.site) en cada pago aprobado; nunca frena el procesamiento del pago (try/catch).
- Facturación manual por defecto (`receipt.status = 'manual'`); automática solo con `INVOICING_AUTO=true`.
- `GET /billing/admin/receipts?status=manual`, `POST /billing/admin/receipts/:id/invoiced`.
- Un pago por facturar que se reembolsa pasa a `skipped` ("Reembolsado antes de facturar").
- Pestaña "Por facturar" con serie-número opcional y "Marcar facturado".

## Lo que tiene que hacer el usuario

- Hacer una compra real y comprobar el correo y la pestaña (`docs/activar-compras-mercadopago.md` §7).
- Facturar a mano mientras no se configure Nubefact.

## Pruebas

- e2e `sale-notice`, `invoicing`, `billing-emails`, `account-provisioning`, `past-due` → verdes.
- `npm test` backend → 1819/1819. Frontend → 1034/1034.

## Pendientes, riesgos y notas

- Si falla la entrega del aviso, no se reintenta solo: reenviar desde la bitácora de correos.
- `markInvoiced` no guarda quién marcó ni cuándo.
- Sin prueba de renovación, add-on ni implementación en el aviso (el código existe).
