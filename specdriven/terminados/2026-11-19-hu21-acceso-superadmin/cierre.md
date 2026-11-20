# HU21 — Recuperar el acceso del superadministrador · Cierre

- **Cerrada:** 2026-11-19
- **Estado:** Terminada (pendiente de que el usuario use la recuperación en producción)
- **Verificación (spec-verifier):** 4 CUMPLE · 2 PARCIAL (C5 `sendCampaign`, C6 guía en docs) — corregidos sin segunda vuelta
- **Commits:** ver `git log` (subida a main)

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Estado | Evidencia |
|---|---|---|
| C1 reinicio por variable, sin ella no cambia | CUMPLE | `users.service.ts` `resetSuperadminFromEnv`; `users.service.spec.ts` «SEED_ADMIN_RESET» |
| C2 nunca asciende, ambigüedad no toca nada | CUMPLE | mismas pruebas (3 casos) |
| C3 login muestra suspendida/desactivada y 429 | CUMPLE | `login.ts` `loginErrorMessage`; `login.spec.ts` |
| C4 recuperación con 429 | CUMPLE | `login.spec.ts` |
| C5 rechazos de Resend como error | CUMPLE tras corrección | `mail.service.ts` (códigos, reservas, eventos, campañas); `mail.service.spec.ts` |
| C6 uso en Coolify | Pendiente del usuario | guía en `docs/deploy.md` «Recuperar el acceso del superadmin» |

## Verificación mecánica

- Backend: `npm test` 120/120 suites, 1654 pruebas; e2e `auth` y `users-admin` 26/26; `tsc --noEmit` y build OK.
- Frontend: 802/802 pruebas; build OK (aviso de presupuesto de `inbox.ts`, previo).

## Desviaciones del plan

- La revocación de refresh tokens se hace con el modelo `RefreshToken` en `UsersService` en vez de `UserSessionsService.revoke`: este depende de `ActiveUserCache`, que depende de `UsersService` (ciclo).

## Riesgos aceptados

- Si `SEED_ADMIN_RESET` queda en `true`, cada arranque vuelve a esa contraseña y cierra las sesiones del superadmin (lo avisan el log y la guía).
- La recuperación sigue respondiendo «si el correo existe…» aunque Resend falle (anti-enumeración); el motivo solo queda en el log.
- `SEED_ADMIN_PASSWORD` no se valida contra la política de contraseñas.

## Lo que tiene que hacer el usuario

- Seguir `docs/deploy.md` → «Recuperar el acceso del superadmin»: poner la variable, redesplegar, entrar, quitarla.
