# HU19 — Administración total de usuarios y contraseñas · Plan técnico

## Estado actual

`UserAdminService.resetAccess` (modos `email`, `temp`), `UserSessionsService.revoke`,
`user_audit`, diálogo `reset-access-dialog.ts`, lista `users.ts` con marca «Temp».

## Diseño

- `ResetAccessDto`: `mode` admite `manual`, más `password` y `mustChange`.
- `resetAccess(..., opts)`: rama `manual` (hash, `mustChangePassword`, `$unset` de códigos).
- `revokeSessions(id, tenantId, actor)` + rutas `POST /users/:id/sessions/revoke` y `POST /admin/users/:id/sessions/revoke`.
- Acción de registro `revoke_sessions`.
- Frontend: tercera opción en el diálogo, botón «Cerrar sesiones» con `ConfirmService`, marca con texto claro.

## Seguridad

La contraseña nunca va al registro ni a logs; mismas reglas de pertenencia y
de «no sobre ti mismo» que HU5.

## Estrategia de pruebas

e2e en `test/users-admin.e2e-spec.ts`; unitarias del diálogo y la lista.

## Fases

1. Backend → 2. Pantalla.
