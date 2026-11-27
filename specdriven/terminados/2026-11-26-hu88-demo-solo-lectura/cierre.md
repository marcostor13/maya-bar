# HU88 — Cuenta demo de solo lectura · Cierre

- **Cerrada:** 2026-11-26
- **Estado:** Terminada
- **Verificación:** mecánica completa. El spec-verifier no se pudo lanzar (el modo automático rechazó la llamada porque un hook la modifica); revisión manual de rutas fuera del interceptor: los gateways solo emiten, la API con clave no aplica (la demo no puede crear claves), no hay GET con escrituras en los controladores.

## Criterios
| # | Estado | Evidencia |
|---|---|---|
| C1 | CUMPLE | `test/demo.e2e-spec.ts` "C1: la demo no puede crear datos" |
| C2 | CUMPLE | e2e "C2: no puede cambiar la contraseña ni crear usuarios" |
| C3 | CUMPLE | e2e "C3: puede ver todo" (`/billing/status` con `demo: true`) |
| C4–C5 | CUMPLE | e2e "C4, C5" |
| C6 | CUMPLE | `src/billing/read-only.interceptor.spec.ts` "cuenta demo (HU88)" |
| C7 | CUMPLE | `frontend/src/app/shared/trial-banner.spec.ts` "HU88 C7" |
| C8 | CUMPLE | unit 1857/1857, e2e API 317/317, frontend 1061/1061, builds OK |

## Cambios
- `ReadOnlyInterceptor`: si la empresa es demo, toda escritura (salvo `/auth/refresh` y `/auth/logout`) responde 403 `DEMO_READ_ONLY`, también en rutas que la solo lectura por cobro deja abiertas.
- `BillingAccessService` lee `demo`; `/billing/status` lo devuelve; el banner del shell avisa "cuenta demo: solo lectura" sin botones de pago.
- Prompt de ventas (`docs/agente-ventas-maya.md`): la demo es solo para mirar.
