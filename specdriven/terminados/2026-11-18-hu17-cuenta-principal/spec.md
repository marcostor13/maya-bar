# HU17 — Restablecer la cuenta del usuario principal · Especificación

Historia: `hu.md` · Fecha: 2026-11-18 · Estado: aprobada

## Objetivo

Que el superadministrador devuelva el acceso al administrador principal de una
empresa en un solo paso (correo, reactivación, contraseña, sesiones), o nombre
uno nuevo si la empresa se quedó sin administrador.

## Usuarios

- SUPERADMIN, desde la ficha de la empresa (HU16).

## Alcance

- Incluye: identificar al usuario principal, recuperar su cuenta (cambiar
  correo, reactivar, contraseña temporal o código por correo, cerrar sesiones),
  nombrar administrador a un usuario existente o crear uno nuevo, registro.
- **Fuera de alcance:** verificación de identidad del cliente (la hace soporte
  fuera de la plataforma), "entrar como".

## Requisitos (EARS)

- **R1** — Cuando se abre la ficha, el sistema debe indicar el usuario
  principal: el `TENANT_ADMIN` activo más antiguo; si no hay, lo dice.
- **R2** — Cuando el superadmin recupera la cuenta de un `TENANT_ADMIN` de la
  empresa, el sistema debe, en un paso: cambiar el correo si se indica (409 si
  está en uso), reactivarlo, restablecer la contraseña (`temp`: devuelve una
  temporal una sola vez y obliga a cambiarla; `email`: envía un código al
  correo vigente) y cerrar todas sus sesiones.
- **R3** — Si el usuario indicado no es de esa empresa o no es `TENANT_ADMIN`,
  entonces 404 / 400 sin cambiar nada.
- **R4** — Cuando el superadmin nombra administrador a un usuario existente de
  la empresa, el sistema debe darle rol `TENANT_ADMIN` y activarlo; cuando
  indica nombre y correo, debe crear un `TENANT_ADMIN` nuevo con contraseña
  temporal (mostrada una vez).
- **R5** — Cada recuperación o nombramiento queda en el registro de la empresa
  y en el de usuarios, sin contraseñas.
- **R6** — Solo SUPERADMIN (403).

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | La ficha trae `owner` con el admin más antiguo activo | e2e API |
| C2 | R2 | Recuperar con correo nuevo y `temp`: la contraseña vieja falla, la temporal entra con `mustChangePassword`, el token anterior da 401, el correo cambió y el usuario desactivado quedó activo | e2e API |
| C3 | R3 | Un usuario de otra empresa → 404; uno de rol `MARKETING` → 400 | e2e API |
| C4 | R4 | Nombrar a un usuario existente lo vuelve `TENANT_ADMIN`; crear uno nuevo devuelve su contraseña temporal y puede entrar | e2e API |
| C5 | R5 | El registro de la empresa tiene `owner_reset` y `owner_assign` sin contraseñas | e2e API |
| C6 | R6 | Un TENANT_ADMIN recibe 403 | e2e API |
| C7 | R1, R2, R4 | La ficha muestra el bloque «Usuario principal», el diálogo de recuperación muestra la contraseña una vez | unitaria frontend |

## Supuestos y decisiones por defecto

- Se reutiliza `UserAdminService` (HU5): mismas reglas, sesiones y registro.
- El modo `email` envía el código al correo ya cambiado.

## Preguntas abiertas

- Ninguna.
