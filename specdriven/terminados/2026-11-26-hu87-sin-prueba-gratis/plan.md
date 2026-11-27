# HU87 — Quitar la prueba gratis · Plan técnico

## Estado actual

- `backend/src/tenants/tenants.service.ts:108-117` — `create()` pone `trialEndsAt` +14 d y `subscription.status = 'trialing'`.
- `backend/src/auth/auth.controller.ts:96` y `auth.service.ts:290` — `POST /auth/register` crea empresa + admin y dispara `CompleteRegistration` por CAPI.
- `backend/src/billing/emails/billing-notices.service.ts:204` — `trialReminders()`.
- `backend/src/billing-admin/subscriptions-admin.*` — `extend-trial` y KPIs `trials`, `trialConversionPct`, `trialCohort`.
- `frontend`: `register.ts`, `trial-banner.ts` (shell), `landing.ts` / `landing.data.ts`, `content-*`, `facts.ts`, `comparativas.ts`, `funciones.ts`, `login.ts`, `subscription-detail.ts`, `billing-admin.ts`, `tenants.ts`, `tenant-detail.ts`, `meta-tracking.service.ts`.
- `backend/test/support/app.ts:60` — el helper `registerTenant` de ~46 suites e2e usa `/auth/register`.

## Diseño

- **API:** `POST /auth/register` → `GoneException('El alta es con pago: elige un plan en mayacrm.site/#precios')`. `verify-email` y `resend-verification` se quedan (cuentas pendientes antiguas). Se borra `extend-trial`.
- **Datos:** `create()` sin prueba. Sin migración (no hay empresas en prueba).
- **Pruebas e2e:** `registerTenant` pasa a crear la empresa como superadmin (`POST /tenants`) y entra con las credenciales devueltas; misma firma, así las 46 suites no cambian.
- **Interfaz:** `/register` redirige a `/checkout` (mapea `pago` → `periodo`) salvo modo verificación; CTA "Pide tu demo" → `https://wa.me/51991172822?text=…`; se quitan banner, botón, KPI, columna y campo.

## Seguridad

R8: el único alta pública es el checkout pagado (webhook firmado de Mercado Pago, HU45/HU47).

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Romper las suites e2e que registran empresas | Mantener la firma del helper |
| Un enlace viejo a `/register` (anuncios, buscadores) | Redirección al checkout, no 404 |
| Cuentas sin confirmar que el login manda a `/register` | Se conserva el modo verificación |

## Estrategia de pruebas

- Unitarias: `tenants.service` (C2), `register` (C4), landing/contenido/shell/billing-admin (C5, C6).
- e2e: `auth` (C1), alta pagada existente (C3), billing y suscripciones ajustadas (C6, C8).

## Fases

1. Backend + helper e2e. 2. Frontend. 3. Docs. 4. Verificación.
