# HU44 — Pantalla "Mi plan y consumo" · Cierre

- **Cerrada:** 2026-11-23
- **Estado:** Terminada
- **Verificación (spec-verifier):** 4 CUMPLE, 1 PARCIAL (C4) → C4 con e2e de navegador a 375 px; corregidos razón social/dirección vacías en factura, precarga del formulario sin Zone.js, toasts de error de carga y lint.
- **Commits:** sin commit

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Límites y uso reales + saldo de créditos | CUMPLE | `backend/test/my-plan.e2e-spec.ts`, `frontend/src/app/pages/settings/my-plan.spec.ts` |
| C2 | Pagos con enlace al comprobante | CUMPLE | ídem |
| C3 | Sin rol admin no ve la ruta; API 403 | CUMPLE | e2e + `roleGuard('TENANT_ADMIN')` + `plan-limit.spec.ts` |
| C4 | 375 px sin desplazamiento horizontal | CUMPLE | `frontend/e2e/billing.e2e.ts` (Playwright) |
| C5 | Factura exige RUC y dirección; boleta con DNI se guarda | CUMPLE | e2e |

## Qué se implementó

- `payments` (`billing/payment.schema.ts`) y `Tenant.billingInfo`.
- `GET /billing/usage`, `GET /billing/payments`, `GET/PUT /billing/info` (solo `TENANT_ADMIN`).
- Pantalla `/settings/plan` con plan actual, consumo, créditos, pagos con PDF/XML y datos de facturación; enlace desde Configuración solo para el admin.
- `UPGRADE_ROUTE` → Mi plan; quien no es admin ve "Pídele al administrador".

## Lo que tiene que hacer el usuario

- Nada.

## Pendientes, riesgos y notas

- "Cancelar" (HU52) y "Comprar más"/add-ons (HU53) se añaden con esas historias; "Comprar add-on" del diálogo lleva por ahora a Mi plan.
- "Cambiar plan" apunta a `/#precios`; en la app Android o en un dominio propio `/` no es la landing: lo resuelve el checkout desde la cuenta (HU46).
- `GET /billing/status` lo ven todos los roles (lo usa el aviso de prueba) e incluye el monto pactado.
