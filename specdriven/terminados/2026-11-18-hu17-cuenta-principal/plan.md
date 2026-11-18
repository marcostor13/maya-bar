# HU17 — Restablecer la cuenta del usuario principal · Plan técnico

## Estado actual

- `UserAdminService` (HU5): `update` (correo, activo, rol), `resetAccess`
  (`temp`/`email`, revoca sesiones), `create` (alta con contraseña temporal).
- Ficha de empresa de HU16: `AdminTenantsController` y `tenant-detail.ts`.

## Diseño

- **API** (`admin/tenants/:id`, SUPERADMIN):
  - `overview` añade `owner` (admin activo más antiguo).
  - `POST owner/recover { userId, email?, mode }` → `update` (correo, activo) + `resetAccess`.
  - `POST owner/assign { userId }` o `{ name, email }` → `update` rol o `create`.
- **Registro:** `tenant_audit` (`owner_reset`, `owner_assign`) + `user_audit` (lo hace `UserAdminService`).
- **Interfaz:** bloque «Usuario principal» en la ficha, diálogo de recuperación
  (correo, modo) y de nombramiento; contraseña temporal mostrada una vez.

## Seguridad

Solo SUPERADMIN; el usuario se resuelve dentro de la empresa (`target`), sin
contraseñas en respuestas salvo la temporal recién generada.

## Estrategia de pruebas

e2e en `test/platform.e2e-spec.ts`; unitaria de la ficha.

## Fases

1. Backend → 2. Pantalla.
