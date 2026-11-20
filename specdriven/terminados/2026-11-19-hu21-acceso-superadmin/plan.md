# HU21 — Plan

- `backend/src/users/users.service.ts`: inyectar `UserSessionsService`; `resetSuperadminFromEnv()` llamado en `onModuleInit` si `SEED_ADMIN_RESET === 'true'`. Elige destino según R2, `updateOne` con `$set` (email, password bcrypt, isActive, emailVerified, mustChangePassword false) y `$unset` (tenantId, códigos), luego `sessions.revoke(id, { refresh: true })`.
- `backend/src/mail/mail.service.ts`: leer `{ error }` de `resend.emails.send` y registrarlo.
- `frontend/src/app/pages/login/login.ts`: función `loginError(err)` con 401 desactivada/suspendida, 429 y resto; `onForgotSubmit` con 429.
- Docs: `docs/deploy` o README de despliegue: cómo usar `SEED_ADMIN_RESET`.
- Pruebas: `users.service.spec.ts`, `mail.service.spec.ts`, `login.spec.ts`.
