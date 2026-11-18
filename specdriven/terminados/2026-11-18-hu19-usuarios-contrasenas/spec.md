# HU19 — Administración total de usuarios y contraseñas · Especificación

Historia: `hu.md` · Fecha: 2026-11-18 · Estado: aprobada

## Objetivo

Que el administrador resuelva cualquier problema de acceso de su equipo sin
soporte: poner la contraseña que elija, cerrar sesiones y ver quién debe
cambiar la contraseña.

## Usuarios

- TENANT_ADMIN (pantalla Usuarios) y SUPERADMIN (`/admin/users`, mismas reglas).

## Alcance

- Incluye: modo «Elegir contraseña» en «Restablecer acceso» con casilla
  «Pedir que la cambie al entrar»; acción «Cerrar sesiones»; marca «Debe
  cambiar la contraseña»; registro.
- **Fuera de alcance:** política de contraseñas configurable, 2FA.

## Requisitos (EARS)

- **R1** — Cuando el administrador restablece con `mode: manual` y una
  contraseña de 8 a 72 caracteres, el sistema debe guardarla (hash), marcar
  `mustChangePassword` según la casilla (por defecto sí), invalidar códigos de
  recuperación y cerrar todas las sesiones del usuario.
- **R2** — Si la contraseña falta, es corta o larga, entonces 400 sin cambios.
- **R3** — Cuando el administrador cierra las sesiones de un usuario, el
  sistema debe invalidar sus tokens de acceso y de renovación sin tocar su
  contraseña.
- **R4** — Nadie usa estas acciones sobre sí mismo (403), ni sobre usuarios de
  otra empresa (404).
- **R5** — Cada acción queda en el registro de usuarios sin la contraseña.
- **R6** — La lista de usuarios muestra «Debe cambiar la contraseña» para quien
  lo tenga pendiente.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | `manual` con la casilla marcada: la contraseña vieja falla, la nueva entra con `mustChangePassword: true`, el token anterior da 401 | e2e API |
| C2 | R1 | Con la casilla desmarcada entra con `mustChangePassword: false` | e2e API |
| C3 | R2 | `manual` sin contraseña o con 7 caracteres → 400 | e2e API |
| C4 | R3 | Cerrar sesiones: el token y el refresh anteriores dan 401; la contraseña sigue valiendo | e2e API |
| C5 | R4 | Sobre sí mismo → 403; otra empresa → 404 | e2e API |
| C6 | R5 | El registro tiene `reset_access` (modo `manual`) y `revoke_sessions`, sin la contraseña | e2e API |
| C7 | R1, R2, R6 | Diálogo: tercera opción con contraseña, confirmación y casilla; no envía si no coinciden; «Cerrar sesiones» pide confirmación; marca en la lista | unitaria frontend |

## Supuestos y decisiones por defecto

- Reglas de seguridad = las del registro (mínimo 8). Máximo 72 por bcrypt.

## Preguntas abiertas

- Ninguna.
