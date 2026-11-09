# HU5 — Eliminar y administrar usuarios · Cierre

- **Cerrada:** 2026-11-09
- **Estado:** Terminada
- **Verificación (spec-verifier):** 1.ª vuelta 13 CUMPLE · 2 PARCIAL (C8, C15) + 1 hallazgo alto de seguridad. 2.ª vuelta 15 CUMPLE · 1 NO VERIFICADO (C16: la e2e de navegador del verificador murió por falta de memoria). C16 cerrado después con la e2e de navegador corrida sola: 18/18.
- **Commits:** sin commit

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Buscar y filtrar el equipo | CUMPLE | `frontend/src/app/pages/users/users.ts` (`filtered`), `users.spec.ts` "buscar y filtrar" |
| C2 | Último acceso / "Nunca" | CUMPLE | `user-sessions.service.ts` `touchAccess`; `users-admin.e2e-spec.ts` "el último acceso…" |
| C3 | Editar correo (409 si está en uso) y teléfono | CUMPLE | `user-admin.service.ts` `update`; e2e "cambiar el correo a uno ya usado…" |
| C4 | Restablecer con temporal corta sesiones | CUMPLE | `jwt.strategy.ts`, `active-user.cache.ts`; e2e API y `frontend/e2e/users.e2e.ts` |
| C5 | Restablecer por código de correo | CUMPLE | `user-admin.service.ts` `resetAccess`; `user-admin.service.spec.ts` |
| C6 | Cambio de rol: token viejo 401, refresh trae el rol nuevo | CUMPLE | e2e "cambiar el rol invalida el token…" |
| C7 | Traspaso de administración | CUMPLE | `user-admin.service.ts` `transferAdmin`; e2e "traspasa la administración…" |
| C8 | La empresa nunca se queda sin admin | CUMPLE | `assertNotLastAdmin`, `users.service.ts` `assertRemovable`; e2e "eliminar al único admin da 403…" |
| C9 | Nadie se gestiona a sí mismo | CUMPLE | e2e "nadie se desactiva, elimina ni se cambia el rol…" |
| C10 | Pantalla `/admin/users` del superadmin | CUMPLE | `admin-users.controller.ts`, `frontend/src/app/pages/admin/users.ts` + spec |
| C11 | Registro de cambios por empresa y de plataforma | CUMPLE | `user-audit.service.ts`; e2e "el registro guarda cada acción…" |
| C12 | Recuperar contraseña desde el login | CUMPLE | `frontend/e2e/users.e2e.ts` "¿Olvidaste tu contraseña?…" |
| C13 | Aislamiento entre empresas y por rol | CUMPLE | e2e "aislamiento: otra empresa recibe 404…" |
| C14 | Sin secretos en el registro ni en las respuestas | CUMPLE | `SECRET_FIELDS`; e2e "ninguna lista devuelve contraseñas…" y "el alta no devuelve el hash…" |
| C15 | Toast, confirmación, Escape, `aria-*`, móvil | CUMPLE | diálogos en `pages/users/*-dialog.ts`, drawer de `users.ts` |
| C16 | `npm run verify` en verde con las e2e de la historia | CUMPLE | ver "Pruebas" |

## Qué se implementó

- Revocación de sesiones: `sessionsValidFrom` en el usuario + `iatMs` en el JWT + `ActiveUserCache.check`. La revocación es completa (también los refresh) al restablecer, desactivar, eliminar o recuperar la contraseña, y ligera al cambiar el rol o el correo.
- `UserAdminService`: crear, editar (correo, teléfono, rol, locales, estado), restablecer acceso (código por correo o contraseña temporal), traspasar la administración y eliminar con reasignación. Aplica las reglas de "uno mismo" y "último admin".
- Registro `user_audit` (TTL 365 días, sin secretos). Rutas `/users/audit` y `/admin/users/audit`.
- Rutas `/admin/users` del superadmin: buscar, activar o desactivar, restablecer, ver el impacto y eliminar dentro de la empresa del usuario.
- Pantalla Usuarios:
  - buscador y filtros por rol y estado;
  - "Último acceso";
  - marca "Tú";
  - correo y teléfono editables;
  - diálogos de restablecer, traspasar y eliminar;
  - pestaña "Registro";
  - estado de error con "Reintentar".
- Página `/admin/users` y entrada "Usuarios" en el menú del superadmin.
- Recuperación de contraseña: se reutiliza el flujo que ya tenía el login, sin página `/recuperar`.
- Correcciones de seguridad: `GET /users`, `reassign-candidates` y `POST /users` ya no devuelven el hash ni el código de recuperación.

## Lo que tiene que hacer el usuario

- Nada obligatorio. El modo "enviar código por correo" necesita un proveedor de correo configurado. Sin él, la API responde que se use la contraseña temporal.

## Pruebas

- `E2E_WEB_PORT=4310 npm run verify` → OK en todos los pasos:
  - backend: 1424 unitarias y 70 e2e de API;
  - frontend: 691 unitarias, build OK y 18 e2e de navegador.
- Después de los últimos ajustes (alta sin hash, foco del panel):
  - lint y `tsc --noEmit` del backend OK;
  - unitarias de `src/users` 38/38;
  - e2e de API 71/71;
  - unitarias de Usuarios 44/44;
  - build del frontend OK;
  - e2e de navegador 18/18, corrida sola.

## Pendientes, riesgos y notas

- El traspaso de administración son dos escrituras ordenadas, sin transacción, porque Mongo no está en réplica. Si falla a mitad quedan dos administradores, nunca ninguno.
- El último acceso se escribe en cada renovación de token, no "como mucho una vez por hora". Es más escritura, sin impacto funcional.
- ~~`forgotPassword` genera el código con `Math.random` y lo guarda en claro~~ Resuelto después del cierre:
  - el código se genera con `crypto.randomInt`;
  - en la base solo queda su hash SHA-256, tanto en el olvido desde el login como en el restablecimiento del admin;
  - tras 5 intentos fallidos el código deja de valer.
  - Pruebas: backend 1428 unitarias, 71 e2e de API y `tsc --noEmit` OK.
  - Los códigos pedidos antes del deploy dejan de valer, porque estaban guardados en claro. Duran 15 minutos.
- El puerto 4300 lo ocupa otro proyecto en esta máquina: los e2e se corren con `E2E_WEB_PORT=4310`.
