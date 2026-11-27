# HU87 — Quitar la prueba gratis: el alta es con pago · Cierre

- **Cerrada:** 2026-11-26
- **Estado:** Terminada (pendiente desplegar y confirmar el número de WhatsApp de la web)
- **Verificación (spec-verifier):** 6 CUMPLE · 1 PARCIAL (C5, `llms.txt`) corregido · C8 verde en la corrida mecánica
- **Commits:** sin commit

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | `POST /auth/register` 410 sin crear nada | CUMPLE | `backend/src/auth/auth.controller.ts`; `test/auth.e2e-spec.ts` |
| C2 | Empresa nueva sin prueba | CUMPLE | `tenants.service.ts` `create`; `tenants.service.spec.ts` |
| C3 | Alta pagada activa el plan | CUMPLE | `account-provisioning.service.ts` sin cambios; `test/account-provisioning.e2e-spec.ts` |
| C4 | `/register` → checkout salvo verificación | CUMPLE | `frontend/src/app/pages/register/register.ts` + spec |
| C5 | Web sin prueba gratis | CUMPLE | landing, contenido, login, `public/llms.txt`; `landing.spec.ts`. Excepción: `comparativas.ts` menciona la prueba de los competidores |
| C6 | Panel sin controles de prueba | CUMPLE | `trial-banner.ts`, `subscription-detail.ts`, `billing-admin.ts`, `tenants.ts`, `tenant-detail.ts`; e2e `extend-trial` 404 |
| C7 | Docs de venta sin prueba | CUMPLE | `docs/agente-ventas-maya.md`, `docs/meta-ads-contenido.md`, `docs/meta-ads-guiones.md` |
| C8 | Empresas existentes sin cambios | CUMPLE | `accessOf` sin cambios; unit 1847/1847, e2e 312/312, frontend 1060/1060 |

## Correcciones tras la verificación

- `frontend/public/llms.txt` ya no ofrece prueba gratis.
- Cuentas pendientes de confirmar creadas antes de HU87: al confirmar el correo su prueba pasa a vencida (solo lectura hasta pagar) con `TenantsService.endUnpaidTrial`; ya no se manda `CompleteRegistration` a Meta.
- Código muerto borrado: `RegisterTenantDto`, `AcquisitionDto`, `registerTenant`, `discardPendingRegistration`, `trackRegistration`.

## Redes sociales (2026-11-26)

- Portada de Facebook nueva ("Pide tu demo por WhatsApp"); la publicación de la portada anterior quedó oculta en la página.
- Presentación de la página de Facebook y del Instagram @mayacrmperu sin prueba gratis.

## Riesgos conocidos

- Las e2e usan empresas creadas por superadmin (acceso tipo legacy), no `active`: el estado de un cliente pagado lo cubren `account-provisioning` y `billing`.
- La web abre WhatsApp con `WHATSAPP_NUMBER`, ahora por defecto 51991172822 (el del agente de ventas); si Coolify lo define con otro número, manda ese.
- El superadmin aún puede fijar `trialEndsAt` por API (no hay interfaz).
