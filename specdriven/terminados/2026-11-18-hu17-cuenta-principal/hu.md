# HU17 — Restablecer la cuenta del usuario principal de una empresa (superadministrador)

## Historia

**Como** superadministrador,
**quiero** recuperar la cuenta del usuario principal (administrador) de una empresa desde su ficha,
**para** devolver el acceso al cliente cuando pierde su contraseña, su correo o se bloquea, sin tocar la base de datos.

## Contexto (estado actual)

- HU5 dejó `/admin/users`: el superadmin busca un usuario y puede activarlo, restablecer su acceso (código por correo o contraseña temporal) o eliminarlo.
- No se puede cambiar el **correo de acceso** del administrador (si el cliente perdió ese correo, no hay salida).
- Si la empresa se quedó sin ningún `TENANT_ADMIN` (eliminado o desactivado), no hay forma de nombrar uno nuevo.
- No hay atajo desde la empresa: hay que buscar al usuario a mano.

## Qué se espera

1. En la ficha de la empresa (HU16), bloque «Usuario principal» con el administrador principal (el `TENANT_ADMIN` más antiguo activo), su correo, estado y último acceso.
2. «Restablecer cuenta»: en un solo paso, opcionalmente cambiar el correo de acceso, reactivar al usuario, generar una contraseña temporal (se muestra una vez) o enviar un código al correo, obligar a cambiarla al entrar y cerrar todas sus sesiones.
3. Si la empresa no tiene administrador activo, poder nombrar a otro usuario de la empresa como administrador o crear uno nuevo con correo y contraseña temporal.
4. Todo queda en el registro de cambios (sin contraseñas).
