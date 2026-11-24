# HU40 — Catálogo único de planes y precios · Plan técnico

## Estado actual

- `backend/src/tenants/tenant.schema.ts:4` `TenantPlan = 'starter'|'pro'|'enterprise'`, sin efecto.
- Precios a mano en `frontend/src/app/pages/landing/landing.data.ts:408`.
- DTO `backend/src/tenants/dto/create-tenant.dto.ts:63` valida los valores viejos.
- Selector en `frontend/src/app/pages/admin/tenants.ts` y `tenant-detail.ts`.

## Diseño

- **Datos**: `plan: PlanId` (default `inicia`), nuevo `legacy?: boolean`.
- **Catálogo**: `billing/plans.catalog.ts` con `PLAN_IDS`, `PLANS`, `priceFor(plan, period, currency)`,
  `publicCatalog()`. Límites numéricos (`null` = ilimitado / a medida).
- **API**: `GET /public/plans` (`PublicPlansController`) con `Cache-Control: public, max-age=300`.
- **Migración**: `BillingMigrationService.onModuleInit` → `updateMany` por cada valor viejo.
- **Interfaz**: selects del superadmin con Inicia/Crece/Escala/Empresa.

## Seguridad

Endpoint público solo lectura con datos públicos. La migración no borra datos.

## Observabilidad

Log con el número de empresas migradas.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Frontend con valores viejos en caché | badge con fallback; select con valores nuevos |

## Estrategia de pruebas

- Unitarias: catálogo (C3, C1), migración (C2), DTO (C4).

## Fases

1. Catálogo + endpoint + migración + selects.

## ADRs

- `decisiones/0005-catalogo-de-planes-en-codigo.md`
