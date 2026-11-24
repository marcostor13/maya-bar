# HU47 — Alta automática · Plan

- `CheckoutService.onPaid(handler)` y `markFulfilled()`: los avisos se disparan al pasar a `paid`. Si falla, el evento de cobro se reintenta (HU45).
- `auth/account-provisioning.service.ts`:
  - Se registra en `onModuleInit`.
  - Deduplica en el proceso (mapa de altas en curso) y relee la sesión: no hace nada si ya está `fulfilled`.
  - Métodos `sendAccess`, `redeem` y `resend`.
- `TenantsService.activatePlan`, `uniqueName` y `setBillingInfo`; `UsersService.superadminEmails`.
- `User.accessTokenHash/accessTokenExpires/accessPending`.
- Frontend:
  - Pantalla `pages/access/access.ts` en `/acceso`.
  - `AuthService.redeemAccess` y `resendAccess`.
  - Estado `activating` en el resultado.

## Seguridad

- En la base solo se guarda el hash del token, que se invalida antes de fijar la contraseña.
- Límites de peticiones: 10 por 15 minutos para canjear y 3 por 15 minutos para reenviar.
- La respuesta de reenvío es siempre la misma, para no revelar qué correos existen.
- Nombres y valores escapados en el HTML de los correos.
