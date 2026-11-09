# HU5 — Administrar y eliminar usuarios · Tareas

- [x] T1 — Revocación de sesiones:
  - `sessionsValidFrom` y `lastAccessAt` en `User`;
  - `ActiveUserCache.check(iat)` y `JwtStrategy`;
  - `lastAccessAt` en `issueRefreshToken`;
  - `resetPassword` revoca.
  - → C2, C4, C6, C12 · prueba: unitaria de la caché y de auth
- [x] T2 — Auditoría: esquema `user_audit` + `UserAuditService` (registrar,
  listar, sin secretos) → C11, C14 · prueba: unitaria
- [x] T3 — `UserAdminService`:
  - guardas de uno mismo y del último admin;
  - editar correo y teléfono;
  - desactivar y activar;
  - restablecer (email/temp);
  - traspaso;
  - revocación;
  - auditoría de alta y de borrado.
  - → C3–C9, C11 · prueba: unitaria
- [x] T4 — Rutas `/users` (reset-access, transfer-admin, audit, PATCH ampliado,
  DELETE con guardas) y `/admin/users` (SUPERADMIN) → C3–C11, C13 · prueba: e2e
  de API
- [x] T5 — Frontend Usuarios:
  - buscador y filtros;
  - último acceso;
  - correo y teléfono;
  - acciones en admins y fila propia;
  - diálogos de restablecer y de traspaso;
  - pestaña Registro;
  - eliminar extraído a un componente.
  - → C1, C2, C11, C15 · prueba: unitaria
- [x] T6 — Recuperación de contraseña: se reutiliza el flujo que ya tiene el
  login (sin `/recuperar`) → C12 · prueba: unitarias existentes de login + e2e de navegador (T8)
- [x] T7 — Página del superadmin `/admin/users` + menú → C10, C11, C15 · prueba:
  unitaria
- [x] T8 — e2e de navegador: recuperación desde el login y restablecer con
  contraseña temporal → C12, C4 · prueba: e2e
- [x] T9 — Verificación mecánica (`npm run verify`) → C16
- [x] T10 — Verificación independiente (`spec-verifier`)
- [x] T11 — Archivar en `terminados/` y actualizar el índice
