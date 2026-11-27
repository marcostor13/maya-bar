# HU90 — Demo sin contraseña · Cierre

- **Cerrada:** 2026-11-27
- **Estado:** Terminada
- **Verificación:** mecánica completa. Sin spec-verifier (en modo automático el hook impide lanzarlo); revisión manual: la ruta no lleva guard, el interceptor de solo lectura bloquea toda escritura con la sesión demo y `/auth/demo` solo entra si la empresa del correo demo tiene `demo: true` y está activa.

## Criterios
| # | Estado | Evidencia |
|---|---|---|
| C1–C2 | CUMPLE | `backend/test/demo.e2e-spec.ts` "sin contraseña (HU90)" C1, C2 |
| C3 | CUMPLE | e2e "C3: si la empresa del correo demo no es la demo, no abre sesión" |
| C4 | CUMPLE | `frontend/src/app/pages/demo/demo.spec.ts` |
| C5 | CUMPLE | `@Throttle` 10/min y `audit.loginOk(..., 'demo')` en `auth.controller.ts`; `app.e2e-spec.ts` la lista como ruta pública |
| C6 | CUMPLE | `docs/agente-ventas-maya.md` sin `[CONTRASEÑA_DEMO]` |

## Pruebas
Unitarias backend 1857/1857 · e2e API 319/319 · frontend 1063/1063 · build frontend OK.
