# HU42 — Límites por plan aplicados · Cierre

- **Cerrada:** 2026-11-23
- **Estado:** Terminada
- **Verificación (spec-verifier):** 4 CUMPLE, 1 PARCIAL → corregidos los hallazgos altos y medios (reactivar usuarios, cupo de emails por destinatarios, función al enviar/reenviar, reconexión de números y buzones, eventos con fecha nueva, Crece sin tope de eventos, prospección en todos los planes).
- **Commits:** sin commit

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Inicia: 3.er usuario (alta o reactivación) 402 y diálogo con Mejorar plan / Comprar add-on | CUMPLE | `backend/test/plan-limits.e2e-spec.ts`, `frontend/src/app/shared/plan-limit.spec.ts` |
| C2 | Inicia: 2.º evento publicado 402, borrador OK | CUMPLE | `plan-limits.e2e-spec.ts`, `plan-limits.service.spec.ts` |
| C3 | Add-on +1 usuario permite el 3.º | CUMPLE | `plan-limits.e2e-spec.ts`, unitaria |
| C4 | `legacy` y Empresa sin límites | CUMPLE | `plan-limits.service.spec.ts` |
| C5 | Inicia: campaña de WhatsApp 402 `PLAN_FEATURE` | CUMPLE | `plan-limits.e2e-spec.ts`, unitaria |

## Qué se implementó

- `PlanLimitsService` global (límite del plan + `tenant.addons`), `PlanLimitException`/`PlanFeatureException` (402).
- Controles: usuarios (alta y reactivación), números de WhatsApp (alta manual y número nuevo por OAuth), buzones (alta y buzón nuevo por OAuth), agentes IA, contactos manuales, eventos activos (publicar o reactivar con fecha), cupo de emails del mes con los destinatarios reales, campañas de WhatsApp (crear y enviar), recuperación y segunda sede.
- Catálogo: Crece sin tope de eventos; prospección en todos los planes (se paga en créditos, HU43).
- Frontend: `planLimitInterceptor` + `<app-plan-limit>`.

## Lo que tiene que hacer el usuario

- Nada.

## Pruebas

- backend `npm test` 134 suites / 1738 OK · `npm run test:e2e` 16 suites / 135 OK
- frontend `ng test` 99 archivos / 921 OK · build OK

## Pendientes, riesgos y notas

- "Mejorar plan"/"Comprar add-on" llevan a `/#precios` hasta HU44/HU53 (en la app nativa `/` redirige).
- El conteo y el alta no son atómicos: dos altas simultáneas pueden pasar el límite por una unidad.
- Contactos: solo el alta manual cuenta; importaciones y altas por mensajes entrantes no se bloquean (decisión de la spec).
- El candado en el menú se sustituyó por el diálogo al intentar la acción.
