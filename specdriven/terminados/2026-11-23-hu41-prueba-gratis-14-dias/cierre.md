# HU41 — Prueba gratis de 14 días real · Cierre

- **Cerrada:** 2026-11-23
- **Estado:** Terminada
- **Verificación (spec-verifier):** 3 CUMPLE, 2 PARCIAL → corregidos (API con clave, recuperación, programados, reintento, caché, texto del plan).
- **Commits:** sin commit

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Empresa nueva en `trialing`, plan Crece, 14 días | CUMPLE | `tenants.service.spec.ts` (HU41 C1), `test/billing.e2e-spec.ts` |
| C2 | Prueba vencida: escrituras 402 con el mensaje, lecturas 200, `/billing` y `/auth` abiertos, API con clave bloqueada | CUMPLE | `read-only.interceptor.spec.ts`, `subscription-access.spec.ts`, `test/billing.e2e-spec.ts` |
| C3 | Banner con días restantes y tono de aviso (reloj simulado) | CUMPLE | `frontend/src/app/shared/trial-banner.spec.ts` |
| C4 | Solo lectura pausa agente IA, campañas, recuperación, programados y reintentos | CUMPLE | `conversations.email.spec.ts`, `campaign-sender.service.spec.ts`, `message-retry.service.spec.ts`; recuperación y programados con la misma comprobación sin prueba propia |
| C5 | Alargar la prueba la reabre e invalida la caché | CUMPLE | `tenants.service.spec.ts` (HU41) |

## Qué se implementó

- `Tenant.subscription` (estado de cobro) y alta en prueba Crece de 14 días.
- `billing/subscription-access.ts` (`accessOf`, regla pura) y `BillingAccessService` (caché 30 s, `canOperate`, `invalidate`); `BillingModule` global.
- `ReadOnlyInterceptor` global: 402 `SUBSCRIPTION_REQUIRED` en escrituras con JWT o clave de API.
- Pausa en `runAgent`, campañas email/SMS, recuperación, mensajes programados (se aplazan 1 h) y reintento automático.
- `GET /billing/status`; banner `app-trial-banner` en el shell; el 402 refresca el banner.
- Quitar `legacy` a un cliente sin suscripción lo deja `active` (no se bloquea de golpe).

## Lo que tiene que hacer el usuario

- Nada.

## Pruebas

- backend `npm test` 132 suites / 1725 OK · `npm run test:e2e` 16 suites / 133 OK
- frontend `ng test` 99 archivos / 921 OK · build OK

## Pendientes, riesgos y notas

- "Elegir plan" va a `/#precios`; en la app nativa `/` redirige: se resuelve en HU44 (pantalla Mi plan) cambiando `UPGRADE_ROUTE`.
- Los correos de los días 10, 13 y 14 llegan con HU50.
