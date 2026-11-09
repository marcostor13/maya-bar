# HU5 — Administrar y eliminar usuarios · Plan técnico

## Estado actual

- `backend/src/users/users.controller.ts`: listar, crear, editar, impacto,
  candidatos y `DELETE :id` (`mode=deactivate|delete`). Solo `TENANT_ADMIN`.
- `users.service.ts`:
  - `updateUser` no acepta correo ni teléfono y no protege al último admin ni
    a uno mismo;
  - `deactivateUser` excluye a cualquier `TENANT_ADMIN`;
  - `assertRemovable` ya protege a uno mismo y al último admin, pero solo al
    eliminar.
- `auth/jwt.strategy.ts` + `active-user.cache.ts`: solo comprueban `isActive`.
- `auth.service.ts`:
  - refresh tokens rotados y `revokeAllFor` (privado);
  - `forgotPassword`/`resetPassword` por código (15 min), sin pantalla en el
    frontend;
  - `resetPassword` no revoca sesiones.
- `frontend/src/app/pages/users/users.ts`: tabla, drawer, credenciales
  temporales y modal de eliminar con impacto. Las filas TENANT_ADMIN no tienen
  acciones.
- `pages/admin/tenants.ts`: única pantalla del superadmin.

## Diseño

- **Datos:**
  - `User`: `lastAccessAt?: Date` y `sessionsValidFrom?: Date` (opcionales,
    sin migración).
  - Nueva colección `user_audit` (`UserAudit`): `tenantId?`, `actorId`,
    `actorName`, `actorRole`, `targetId`, `targetEmail`, `targetName`, `action`
    (`create|update|activate|deactivate|reset_access|transfer_admin|delete`),
    `changes` (`{campo: {from, to}}`) y `at`.
  - Índices de `user_audit`: `{tenantId, at:-1}`, `{targetId, at:-1}` y TTL
    365 días sobre `at`.
- **Revocación:**
  - `ActiveUserCache.check(userId, iat)` devuelve `ok|inactive|revoked`;
    `JwtStrategy` responde 401 en los dos últimos.
  - `UsersService.revokeSessions(id, {refresh})` fija `sessionsValidFrom`,
    revoca los refresh tokens (modelo `RefreshToken` registrado también en
    `UsersModule`) e invalida la caché.
  - El cambio de rol solo invalida el access token: al renovar, `buildSession`
    lee el rol nuevo de la base.
- **API de empresa** (`/users`, `TENANT_ADMIN`):
  - `PATCH :id` acepta además `email` y `phone`. Al cambiar rol o correo,
    revocación ligera; al desactivar, completa.
  - `POST :id/reset-access {mode: 'email'|'temp'}` → `{mode, tempPassword?}`.
  - `POST transfer-admin {toUserId, newRole}`.
  - `GET audit?targetId=`.
  - `DELETE :id` (desactivar) usa ahora las mismas reglas de último admin y de
    uno mismo.
- **API de plataforma** (`/admin/users`, `SUPERADMIN`, nuevo
  `AdminUsersController` en `users/`):
  - `GET ?q=`
  - `PATCH :id/active {isActive}`
  - `POST :id/reset-access`
  - `GET :id/impact`
  - `GET :id/reassign-candidates`
  - `DELETE :id?reassignTo=`
  - `GET audit?targetId=`

  Resuelve la empresa desde el propio usuario y reutiliza los métodos del
  servicio.
- **Lógica nueva:**
  - `UserAdminService` en `users/`, que inyecta `MailService`, `UserAudit` y
    `RefreshToken`;
  - guardas comunes `assertManageable(target, actor)` y
    `assertKeepsAdmin(target, change)`.
- **Recuperación:** `AuthService.resetPassword` llama a `revokeSessions` tras
  cambiar la contraseña.
- **Último acceso:** `issueRefreshToken` hace `updateOne({lastAccessAt: now})`.
- **Interfaz:**
  - `users.ts`:
    - buscador, filtros por rol y estado, columna "Último acceso";
    - correo y teléfono en el drawer al editar;
    - fila propia con el distintivo "Tú" y sin acciones peligrosas;
    - acciones en las filas de administradores;
    - botón "Restablecer acceso" y botón "Traspasar administración";
    - pestaña "Registro".
  - Componentes nuevos en `pages/users/`:
    - `reset-access-dialog.ts`: elige el modo, confirma y muestra la
      temporal una vez;
    - `user-audit.ts`: lista del registro, recibe la URL;
    - `transfer-admin-dialog.ts`.
  - Nueva página `pages/admin/users.ts` (`/admin/users`, `roleGuard('SUPERADMIN')`),
    entrada "Usuarios" en el menú del superadmin. Reutiliza
    `reset-access-dialog` y `user-audit`; eliminar reutiliza un componente
    `user-delete-dialog.ts`, extraído del modal actual de `users.ts`.
  - Recuperación: el login ya tiene las vistas `forgot` (correo) y `reset`
    (código + nueva contraseña) con su enlace. Se reutilizan; no se crea
    `/recuperar` (decisión tomada al implementar).
- **Integraciones externas:** ninguna nueva (correo con el `MailService`
  existente).

## Seguridad

- Escalada de privilegios: solo `TENANT_ADMIN` usa `/users` (y solo sobre su
  `tenantId`); solo `SUPERADMIN` usa `/admin/users`. Ninguna ruta toca a un
  `SUPERADMIN`.
- Sesiones robadas: restablecer o desactivar revoca los access tokens
  (`sessionsValidFrom`, ≤ 60 s por la caché, inmediato en este proceso) y los
  refresh tokens.
- Enumeración: forgot-password responde igual siempre (ya existe).
- Datos: el registro no guarda contraseñas ni códigos; la temporal solo viaja en
  la respuesta.
- Bloqueo de la empresa: la regla del último admin se aplica en todas las vías
  (editar, desactivar, eliminar, superadmin).

## Observabilidad

- Logs con ids, sin correos ni contraseñas, en el restablecimiento, el traspaso
  y la revocación.
- Errores al usuario con mensaje en toast.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| `iat` tiene resolución de segundos: un token emitido en el mismo segundo que la revocación sobrevive | Se compara `iat < floor(validFrom/1000)`. El hueco es ≤ 1 s y el login posterior a la revocación es legítimo |
| Varias réplicas: la caché de otra instancia tarda hasta 60 s | Aceptado (igual que hoy al desactivar) |
| El correo del modo "enviar código" falla | Error 502 con mensaje y sin cambiar la contraseña: se envía antes de invalidarla |
| El cambio de correo choca con el índice único | Comprobación previa + captura del error de duplicado → 409 |

## Estrategia de pruebas

- **Unitarias backend:** `user-admin.service.spec.ts` (guardas, reset en los dos
  modos, traspaso, revocación, auditoría sin secretos), `active-user.cache.spec`
  (revocación por `iat`) y `users.service.spec` (correo duplicado).
- **e2e de API:** `test/users-admin.e2e-spec.ts` cubre C2–C4, C6–C11, C13 y C14.
- **Unitarias frontend:** `users.spec.ts` (filtros, último acceso, acciones),
  diálogos, `admin/users.spec.ts` y `forgot-password.spec.ts`.
- **e2e de navegador:** `frontend/e2e/users.e2e.ts` cubre la recuperación desde
  el login (C12) y el restablecimiento con contraseña temporal desde Usuarios.

## Fases

1. Backend: revocación, guardas, edición, reset, traspaso, auditoría y último
   acceso, con API de empresa y de plataforma. Desplegable solo: la interfaz
   actual sigue funcionando.
2. Frontend de empresa (Usuarios) y recuperación de contraseña.
3. Frontend del superadmin.

## ADRs

- No aplica: no hay cambio difícil de revertir. La revocación por fecha es
  aditiva y se apoya en el JWT y la caché existentes.
