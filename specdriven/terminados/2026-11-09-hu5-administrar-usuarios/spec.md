# HU5 — Administrar y eliminar usuarios · Especificación

Historia: `backlog/hu5.md` · Fecha: 2026-11-08 · Estado: aprobada

## Objetivo

El administrador de cada empresa y el superadministrador de la plataforma deben
gestionar el ciclo de vida completo de los usuarios sin pasar por soporte ni por
la base de datos:
- alta, edición y suspensión;
- recuperar el acceso y cortar sesiones;
- traspasar la administración, eliminar;
- y que quede registro de todo.

## Usuarios

- **Administrador de la empresa (TENANT_ADMIN):** gestiona su equipo.
- **Superadministrador (SUPERADMIN):** atiende a usuarios de cualquier empresa
  (desbloquear, restablecer, eliminar).
- **Cualquier usuario:** recuperar su contraseña por sí mismo desde el login.

## Alcance

- Incluye:
  - búsqueda y filtros;
  - último acceso;
  - editar correo y teléfono;
  - restablecer el acceso (código por correo o contraseña temporal);
  - revocar sesiones al restablecer, cambiar el rol o desactivar;
  - traspasar la administración;
  - impedir que la empresa se quede sin administrador;
  - pantalla de usuarios de la plataforma para el superadministrador;
  - registro de cambios;
  - recuperación "¿Olvidaste tu contraseña?" desde el login (al implementar se
    vio que el login ya trae este flujo en línea; se reutiliza y se cubre con
    e2e en vez de crear una página `/recuperar` duplicada).
- **Fuera de alcance:**
  - SSO y 2FA;
  - invitaciones con enlace;
  - límite de usuarios por plan;
  - "entrar como" otro usuario;
  - listar y cerrar sesiones una a una.

## Requisitos (EARS)

Funcionales:
- **R1** — Cuando el administrador escribe en el buscador o elige un rol o
  estado, la lista debe mostrar solo los usuarios que coinciden (nombre o
  correo, sin distinguir mayúsculas).
- **R2** — El sistema debe guardar la fecha del último acceso al iniciar sesión,
  renovar la sesión o confirmar el correo, y mostrarla en la lista ("Nunca" si
  no hay).
- **R3** — Cuando el administrador edita un usuario, debe poder cambiar nombre,
  correo, teléfono, rol, locales y estado.
- **R4** — Si el correo nuevo ya pertenece a otra cuenta, entonces el sistema
  debe rechazarlo con un mensaje claro y no guardar nada.
- **R5** — Cuando se restablece el acceso de un usuario, el sistema debe:
  - invalidar su contraseña actual;
  - según lo elegido, enviarle un código de recuperación por correo o generar
    una contraseña temporal que se muestra una sola vez;
  - marcar `mustChangePassword` en el modo temporal.
- **R6** — Cuando se restablece el acceso, se cambia el rol, se cambia el correo
  o se desactiva a un usuario, el sistema debe invalidar sus sesiones: los
  tokens de acceso emitidos antes dejan de valer y, salvo en el cambio de rol o
  de correo, también los de renovación.
- **R7** — Cuando el administrador traspasa la administración a otro usuario
  activo de su empresa, el sistema debe:
  - hacer `TENANT_ADMIN` al destino;
  - pasar al administrador que traspasa al rol que él elija;
  - hacerlo en una sola petición. Son dos escrituras ordenadas (primero se
    nombra al nuevo admin), así que un fallo a mitad deja dos administradores,
    nunca ninguno. No hay transacción: la Mongo de producción y la de pruebas no
    son réplica (decisión tomada al implementar).
- **R8** — Si una operación dejara la empresa sin ningún `TENANT_ADMIN` activo
  (desactivar, eliminar o cambiar el rol), entonces el sistema debe rechazarla.
- **R9** — Si un usuario intenta desactivarse, eliminarse o cambiarse el rol a sí
  mismo, entonces el sistema debe rechazarlo. Para dejar de ser administrador se
  usa el traspaso.
- **R10** — Cuando el superadministrador busca por correo o nombre, el sistema
  debe listar usuarios de todas las empresas con su empresa, rol, estado y último
  acceso, y permitir activar o desactivar, restablecer el acceso y eliminar, con
  el mismo impacto y reasignación dentro de la empresa del usuario.
- **R11** — Cuando se crea, edita, activa, desactiva, restablece, traspasa o
  elimina un usuario, el sistema debe registrar:
  - autor;
  - usuario afectado;
  - empresa;
  - acción;
  - campos cambiados (antes y después);
  - fecha.
- **R12** — El administrador debe ver el registro de su empresa, y el
  superadministrador el de toda la plataforma.
- **R13** — Cuando un usuario pulsa "¿Olvidaste tu contraseña?", debe poder pedir
  un código por correo y fijar una contraseña nueva con él. Al hacerlo, sus
  sesiones anteriores quedan invalidadas.

No funcionales:
- **R14** — Seguridad:
  - las rutas de empresa solo aceptan `TENANT_ADMIN` y operan sobre usuarios
    de su `tenantId` (del JWT): un usuario de otra empresa da 404;
  - las rutas de plataforma solo aceptan `SUPERADMIN`;
  - un superadministrador no se gestiona desde ninguna de las dos.
- **R15** — Privacidad: el registro y los logs no guardan contraseñas, códigos ni
  hashes. La recuperación no revela si un correo existe.
- **R16** — Interfaz:
  - `ToastService` y `ConfirmService`;
  - estados de carga, vacío y error;
  - iconos lucide;
  - modales con Escape, `aria-*` y autofocus;
  - usable en el móvil.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | Dado un equipo con varios usuarios, cuando busco "ana" y filtro "Desactivados", entonces solo veo los desactivados cuyo nombre o correo contiene "ana" | unitaria frontend |
| C2 | R2 | Dado un usuario que inicia sesión, cuando el admin lista el equipo, entonces ve su último acceso; uno que nunca entró muestra "Nunca" | e2e API + unitaria frontend |
| C3 | R3, R4 | Dado un correo ya usado por otra cuenta, cuando el admin lo asigna, entonces responde 409 con mensaje y el usuario no cambia | e2e API |
| C4 | R5, R6 | Dado un usuario con sesión abierta, cuando el admin restablece su acceso con contraseña temporal, entonces la contraseña vieja no sirve, su token anterior da 401, su refresh token no renueva y la temporal entra con `mustChangePassword` | e2e API |
| C5 | R5 | Cuando el admin elige "enviar código", entonces se envía el código al correo del usuario y la contraseña vieja deja de servir | unitaria backend |
| C6 | R6 | Dado un usuario conectado, cuando el admin le cambia el rol, entonces su token anterior da 401 y al renovar recibe el rol nuevo | e2e API |
| C7 | R7 | Cuando el admin traspasa la administración a B eligiendo "Gerente" para sí, entonces B es TENANT_ADMIN, el admin es MANAGER y ambos tienen que renovar sesión | e2e API |
| C8 | R8 | Dado un único TENANT_ADMIN activo, cuando otro admin (o el superadmin) intenta desactivarlo, eliminarlo o quitarle el rol, entonces se rechaza con 403 y mensaje | unitaria + e2e API |
| C9 | R9 | Cuando un admin intenta desactivarse, eliminarse o cambiarse el rol, entonces se rechaza con 403 | unitaria + e2e API |
| C10 | R10 | Dado un usuario de la empresa X, cuando el superadmin lo busca por correo, entonces lo ve con "X", y puede desactivarlo, restablecerlo y eliminarlo reasignando a otro usuario de X | e2e API + unitaria frontend |
| C11 | R11, R12 | Tras crear, editar el rol, desactivar, restablecer, traspasar y eliminar, el registro de la empresa muestra cada acción con autor, afectado y cambios; el de otra empresa no las muestra; el del superadmin sí | e2e API + unitaria frontend |
| C12 | R13 | Desde el login, "¿Olvidaste tu contraseña?" → correo → código + nueva contraseña → entra con la nueva, y su sesión anterior queda invalidada | e2e navegador (código leído de la base de prueba) + e2e API |
| C13 | R14 | Un TENANT_ADMIN no puede leer ni modificar usuarios de otra empresa (404); un no admin recibe 403; las rutas `/admin/users` dan 403 a quien no sea SUPERADMIN | e2e API |
| C14 | R15 | Las entradas del registro no contienen `password`, `resetPasswordCode` ni hashes, y la recuperación responde igual exista o no el correo | unitaria + e2e API |
| C15 | R16 | Las acciones nuevas usan toast y confirmación; los modales cierran con Escape y tienen `aria-*`; la lista se ve en el móvil | unitaria frontend + revisión |
| C16 | — | `npm run verify` completo en verde, con e2e de navegador de recuperar, restablecer, buscar y eliminar con reasignación | verificación mecánica + e2e navegador |

## Supuestos y decisiones por defecto

- **Revocación:**
  - campo `sessionsValidFrom` en el usuario; un token con `iat` anterior se
    rechaza;
  - la caché `ActiveUserCache` guarda el estado activo y esa fecha (TTL 60 s,
    se invalida al cambiar);
  - los refresh tokens se revocan en la colección existente.
- **Cambio de rol o de correo:** solo invalida el access token. El frontend
  renueva solo (interceptor) y recibe el rol nuevo, sin echar al usuario.
- **"Enviar código":** fija una contraseña aleatoria desconocida y envía el
  código de 6 dígitos (15 min) que ya usa `/auth/forgot-password`.
- **Traspaso:** `POST /users/transfer-admin { toUserId, newRole }`. El rol nuevo
  debe ser asignable y distinto de `TENANT_ADMIN`.
- **Varios administradores:** puede haber varios TENANT_ADMIN, y un admin puede
  gestionar a otro admin (no a sí mismo).
- **Registro:** colección `user_audit` con TTL de 365 días. Se listan las 200
  entradas más recientes, filtrables por usuario afectado.
- **Superadmin:**
  - busca con mínimo 2 caracteres y ve como máximo 50 resultados;
  - para eliminar, reasigna dentro de la empresa del usuario;
  - no ve ni gestiona otros SUPERADMIN.
- **Último acceso:** se actualiza al emitir un refresh token (login, renovación,
  confirmación de correo).

## Preguntas abiertas

- Ninguna bloqueante.
