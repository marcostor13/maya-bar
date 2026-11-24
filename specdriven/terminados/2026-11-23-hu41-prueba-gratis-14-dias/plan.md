# HU41 — Prueba gratis de 14 días real · Plan técnico

## Estado actual

- `backend/src/tenants/tenants.service.ts` `create` fija `trialEndsAt` (+14 días) sin efecto.
- Suspensión por `isActive` ya corta login/JWT (HU16); no hay estado de cobro.

## Diseño

- **Datos**: `Tenant.subscription` (objeto: `status`, `period`, `currency`, `amount`, `currentPeriodEnd`, `graceEndsAt`, `cancelAtPeriodEnd`, `mpPreapprovalId`, `pendingPlan`, `founder`), escrito siempre con `$set` por ruta.
- **Regla**: `billing/subscription-access.ts` `accessOf(snapshot, now)` pura.
- **Servicio**: `BillingAccessService` (caché 30 s, `canOperate`, `invalidate`), módulo `@Global`.
- **API**: interceptor global `ReadOnlyInterceptor` (corre tras los guards: `req.user` existe); `GET /billing/status`.
- **Procesos**: `ConversationsService.runAgent` y `CampaignSenderService.runOne` consultan `canOperate` (inyección `@Optional`).
- **Interfaz**: `shared/trial-banner.ts` en el shell.

## Seguridad

El estado se lee del servidor por `tenantId` del JWT; el cliente no puede saltarse el 402.

## Observabilidad

Log cuando el agente se pausa por cobro.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Bloquear a clientes actuales | `legacy` sin suscripción = sin cambios |
| Ruta necesaria bloqueada | lista `ALWAYS_ALLOWED` probada |

## Estrategia de pruebas

- Unitarias: regla, interceptor, create/update, banner con reloj simulado.

## Fases

1. Backend + banner.
