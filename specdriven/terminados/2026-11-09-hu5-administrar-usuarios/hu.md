# HU5 — Administrar y eliminar usuarios

## Historia

**Como** administrador de una empresa en Maya CRM (y como superadministrador de
la plataforma),
**quiero** gestionar por completo a las personas que usan la cuenta: darlas de
alta, editarlas, suspenderlas, recuperarles el acceso y eliminarlas,
**para** controlar quién entra, con qué permisos, y no depender de soporte cada
vez que alguien se va o pierde su contraseña.

## Contexto (estado actual del código)

Buena parte ya existe en `Usuarios` (`frontend/src/app/pages/users/users.ts`,
`backend/src/users/`):

- Listar, crear (`POST /users`), editar nombre, rol, activo y locales
  (`PATCH /users/:id`).
- Desactivar y activar. La sesión de un desactivado se corta por
  `active-user.cache`.
- Eliminar definitivamente (`DELETE /users/:id`) con:
  - vista previa de lo que tiene asociado (`GET /users/:id/impact`),
  - reasignación a otro usuario o liberación a nivel de empresa
    (`USER_REFERENCES` en `user-references.ts`).
- Matriz de roles y permisos por módulo (`roles-matrix.ts`).

Lo que falta o queda corto:

- **Recuperar el acceso:** el administrador no puede restablecer la contraseña
  de alguien ni reenviarle sus credenciales. Hoy solo existe la recuperación por
  correo que inicia el propio usuario.
- **Datos de contacto:** no se pueden editar el correo ni el teléfono
  (`updateUser` solo acepta name, role, isActive y localIds).
- **Visibilidad:** no se sabe cuándo entró cada usuario por última vez, ni hay
  búsqueda ni filtros por rol o estado.
- **Dueño de la cuenta:** el `TENANT_ADMIN` no se puede desactivar ni eliminar
  (`deactivateUser` lo excluye), y no hay forma de traspasar la propiedad de la
  empresa a otra persona.
- **Superadministrador:** solo gestiona empresas (`/admin/tenants`). No puede
  buscar a un usuario de cualquier empresa para desbloquearlo, restablecer su
  acceso o eliminarlo; hoy hace falta tocar la base de datos.
- **Registro:** no queda constancia de quién creó, cambió de rol, desactivó o
  eliminó a un usuario.
- **Sesiones:** desactivar corta la sesión, pero no hay "cerrar todas las
  sesiones" tras un cambio de contraseña o de rol.

## Qué se pide

### A. Administrador de la empresa (Usuarios)

1. Buscar por nombre o correo, y filtrar por rol y estado (activo o desactivado).
2. Ver la fecha del último acceso de cada usuario.
3. Editar correo y teléfono, comprobando que el correo no esté en uso.
4. **Restablecer el acceso:** generar una contraseña temporal o enviar un
   enlace de restablecimiento por correo. El usuario debe cambiarla al entrar
   (`mustChangePassword`).
5. **Cerrar sesiones:** que al restablecer la contraseña, cambiar el rol o
   desactivar, las sesiones abiertas de ese usuario dejen de valer.
6. **Traspasar la propiedad:** el `TENANT_ADMIN` puede pasar el rol de dueño a
   otro usuario activo de la empresa, con confirmación. Después de eso el
   antiguo dueño se puede editar, desactivar o eliminar como cualquier otro.
7. Mantener el flujo actual de eliminar: impacto, reasignación y confirmación.

### B. Superadministrador (plataforma)

1. Nueva pantalla de usuarios de toda la plataforma: buscar por correo o nombre
   y ver la empresa, el rol, el estado y el último acceso.
2. Desde ahí: activar o desactivar, restablecer el acceso y eliminar, reusando
   el mismo flujo de impacto y reasignación de la empresa del usuario.
3. Las acciones del superadministrador quedan registradas.

### C. Registro de cambios

1. Guardar quién hizo qué y cuándo: alta, cambio de rol, edición de datos,
   activación o desactivación, restablecimiento, traspaso y eliminación.
2. El administrador de la empresa ve el registro de su empresa; el
   superadministrador, el de toda la plataforma.

## Criterios de aceptación

- C1. El administrador busca "ana" y filtra por "Desactivados": la lista muestra
  solo los usuarios que coinciden, también en el móvil.
- C2. Cada usuario muestra su último acceso, o "Nunca" si no ha entrado.
- C3. Cambiar el correo a uno que ya usa otra cuenta da un error claro y no
  guarda nada.
- C4. Tras "Restablecer acceso", la contraseña anterior deja de funcionar, la
  sesión abierta de ese usuario se corta en su siguiente petición, y al entrar
  con la nueva se le obliga a cambiarla.
- C5. Cambiar el rol de un usuario conectado hace que su siguiente petición use
  los permisos nuevos o le pida volver a entrar. Nunca conserva los anteriores.
- C6. El dueño traspasa la propiedad a otro usuario: este pasa a `TENANT_ADMIN`,
  el antiguo dueño pasa al rol que se elija, y la empresa nunca se queda sin
  administrador.
- C7. El sistema no permite eliminar ni desactivar al único `TENANT_ADMIN` de
  la empresa.
- C8. Un usuario no puede eliminarse ni desactivarse a sí mismo.
- C9. El superadministrador encuentra a un usuario de cualquier empresa por su
  correo y puede desactivarlo, restablecer su acceso o eliminarlo, con el mismo
  resumen de impacto y reasignación.
- C10. Ninguna ruta de administración de una empresa deja leer ni modificar
  usuarios de otra (404). Las rutas de plataforma exigen `SUPERADMIN`.
- C11. Cada acción de la lista C.1 deja una entrada con autor, usuario afectado,
  acción, fecha y cambio (sin contraseñas ni códigos).
- C12. Todo usa `ToastService` y `ConfirmService`, con estados de carga, vacío y
  error, iconos lucide, accesible por teclado.
- C13. Pruebas:
  - unitarias de backend (servicio de usuarios, traspaso, revocación de sesiones);
  - unitarias de frontend (pantalla de usuarios y pantalla de plataforma);
  - e2e de API: restablecer, revocar, traspasar, aislamiento entre empresas y superadmin;
  - e2e de navegador: buscar, restablecer y eliminar con reasignación.
- C14. `npm run verify` pasa completo.

## Fuera de alcance

- Inicio de sesión con Google o Microsoft (SSO) y doble factor (2FA).
- Invitaciones con enlace para que el usuario elija su contraseña. Se puede
  proponer en la spec si sale barato junto con el restablecimiento por enlace.
- Límite de usuarios por plan o facturación por usuario.
- Suplantar a un usuario ("entrar como").

## Decisiones por defecto (revisables en la spec)

- **Revocación de sesiones:** un contador `tokenVersion` en el usuario, que va
  dentro del JWT y se compara en cada petición, aprovechando la caché de
  `active-user.cache`.
- **Restablecimiento:** por defecto, enlace por correo. La contraseña temporal
  se muestra una sola vez en pantalla, solo si el usuario no tiene correo
  verificable.
- **Último acceso:** se guarda al hacer login y se refresca como mucho una vez
  por hora por usuario.
- **Registro:** colección propia, `user_audit`, retenida 12 meses.
