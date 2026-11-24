# HU42 — Límites por plan aplicados · Plan técnico

## Estado actual

- Sin límites: `users.controller.ts:59`, `whatsapp-accounts.controller.ts:73`, `email-accounts.controller.ts:62`, `ai-agents.controller.ts:38`, `customers.controller.ts:59`, `events.controller.ts:84/95`, `campaigns.controller.ts:91/97`, `locals.controller.ts:42`, `recovery.controller.ts:57`.
- Catálogo con límites y funciones: `billing/plans.catalog.ts` (HU40).

## Diseño

- **Datos**: `Tenant.addons?: Partial<Record<LimitKey, number>>` (lo llena HU53).
- **Servicio**: `PlanLimitsService` (global): `effectiveLimits(tenantId)`, `usage(tenantId, key)` contando por
  `connection.model(nombre)` (sin importar los módulos), `assertCanAdd(tenantId, key, adding?)`,
  `assertFeature(tenantId, feature)`. Excepciones `PlanLimitException` / `PlanFeatureException` (402).
- **Puntos de control**: en los controladores/servicios listados arriba, antes de crear.
- **Interfaz**: `PlanLimitDialogComponent` en la raíz + interceptor HTTP que lo abre con 402 `PLAN_LIMIT`/`PLAN_FEATURE`.

## Seguridad

Límites calculados en el servidor con `tenantId` del JWT.

## Observabilidad

El 402 lleva `resource`, `limit` y `used` para que el usuario sepa qué tocó.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Bloquear a clientes actuales | `legacy` exento (HU40 los marcó a todos) |
| Contar mal | conteos simples por `tenantId`, probados |

## Estrategia de pruebas

- Unitarias del servicio (C2–C5), del diálogo (C1 UI); e2e de usuarios y eventos (C1, C2).

## Fases

1. Servicio + puntos de control + diálogo.
