# HU40 — Catálogo único de planes y precios · Cierre

- **Cerrada:** 2026-11-23
- **Estado:** Terminada
- **Verificación (spec-verifier):** 3 CUMPLE, 1 PARCIAL (C1 sin prueba HTTP) → corregido después: prueba del controlador añadida, e2e de plataforma actualizado.
- **Commits:** sin commit

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | `GET /public/plans` con 4 planes, PEN/USD, 3 periodos, límites, sin sesión y caché pública | CUMPLE | `backend/src/billing/public-plans.controller.spec.ts` |
| C2 | Migración `starter/pro/enterprise` → catálogo con `legacy: true` | CUMPLE | `backend/src/billing/billing-migration.service.spec.ts` |
| C3 | Trimestral = m×3×0,95 redondeado, anual = m×10 | CUMPLE | `backend/src/billing/plans.catalog.spec.ts` |
| C4 | `plan: 'pro'` → 400 | CUMPLE | `backend/src/tenants/dto/update-tenant-plan.dto.spec.ts`, `backend/test/platform.e2e-spec.ts` |

## Qué se implementó

- `backend/src/billing/plans.catalog.ts`: Inicia S/ 99 · US$29, Crece S/ 249 · US$79, Escala S/ 549 · US$169, Empresa a medida; límites y funciones por plan; `priceFor`, `withIgv`, `publicCatalog`.
- `GET /public/plans` y migración idempotente al arrancar (`BillingMigrationService`).
- `Tenant.plan` = id del catálogo (por defecto `inicia`), campo `legacy`; el superadmin puede quitar o poner `legacy` y elegir plan al crear (antes el selector se descartaba).
- Selectores, filtro y badges del superadmin con los planes nuevos (colores con variables).
- ADR `decisiones/0005-catalogo-de-planes-en-codigo.md`.

## Lo que tiene que hacer el usuario

- Nada.

## Pruebas

- `backend npm run build` OK · `npm test` 131 suites / 1714 pruebas OK · `npm run test:e2e -- platform` 19/19 OK
- `frontend ng test` 97 archivos / 914 pruebas OK · `npm run build` OK (aviso de presupuesto de `inbox.ts`, previo)

## Pendientes, riesgos y notas

- La landing todavía muestra los precios viejos (S/ 89): lo resuelve HU56.
- El árbol de trabajo contiene a la vez código de HU41 (estado de cobro); se archiva igual porque todo está en verde.
