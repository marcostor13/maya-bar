# HU62 — Plan
- `auth/totp.ts`: base32, HOTP/TOTP ±1 paso, otpauth, códigos de respaldo (+ unitarias con vectores del RFC).
- `user.schema`: `twoFactor` y `twoFactorPending`; `tenant.schema`: `require2fa`.
- `auth/two-factor.service.ts`: `gate` (reto o configuración obligatoria; dispositivo recordado), `verifyChallenge`, `resendLoginEmail`, `startSetup`/`confirmSetup`, `status`, `regenerateBackupCodes`, `disable`, `reset`, `setTenantPolicy`. Retos como JWT cortos con `purpose`.
- `auth/two-factor.controller.ts` (`/auth/2fa/*`); `/auth/login` devuelve el reto cuando corresponde.
- Frontend: login con pantallas de código, configuración obligatoria y códigos de respaldo; Configuración → Seguridad; Usuarios → "Reiniciar 2FA".
