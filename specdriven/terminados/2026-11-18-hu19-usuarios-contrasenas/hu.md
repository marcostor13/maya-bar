# HU19 — Administración total de usuarios y contraseñas (administrador)

## Historia

**Como** administrador de una empresa,
**quiero** controlar por completo las cuentas de mi equipo, incluida su contraseña,
**para** resolver accesos al momento sin depender de soporte ni del correo del usuario.

## Contexto (estado actual, HU5)

Ya existe en Usuarios: alta, edición de nombre/correo/teléfono/rol/locales, activar/desactivar, restablecer acceso (código por correo o contraseña temporal generada), traspasar la administración, eliminar con reasignación, último acceso y registro de cambios.

Falta:
- Poner una **contraseña elegida** por el administrador (hoy solo se genera una al azar).
- Decidir si el usuario debe cambiarla al entrar o no.
- **Cerrar las sesiones** de un usuario sin cambiarle nada más (p. ej. móvil perdido).
- Ver de un vistazo quién tiene pendiente cambiar la contraseña.

## Qué se espera

1. En «Restablecer acceso», tercera opción «Elegir contraseña» con confirmación y las mismas reglas de seguridad del registro, y la casilla «Pedir que la cambie al entrar».
2. Acción «Cerrar sesiones» por usuario, con confirmación.
3. Marca «Debe cambiar la contraseña» en la lista.
4. Todo queda en el registro de cambios (sin la contraseña).
