# HU21 — Recuperar el acceso del superadministrador · Especificación

Historia: `hu.md` · Fecha: 2026-11-19 · Estado: aprobada

## Objetivo

El superadmin quedó fuera de producción y la pantalla no dice por qué: el login convierte casi cualquier 401 en «Credenciales incorrectas», un 429 en «No pudimos conectar», y la recuperación dice «código enviado» aunque Resend rechace el correo (su SDK devuelve `{ error }` sin lanzar). Se añade una vía de emergencia controlada por quien administra el servidor y se muestran los motivos reales.

## Usuarios

- Superadmin de la plataforma: volver a entrar.
- Cualquier usuario: entender por qué no entra.

## Alcance

- Incluye: reinicio del superadmin al arrancar con `SEED_ADMIN_RESET=true`; mensajes del login (empresa suspendida, cuenta desactivada, demasiados intentos); recuperación con 429 visible; registro del error real de Resend.
- **Fuera de alcance:** cambiar límites de intentos; recuperar por SMS/WhatsApp; panel para gestionar otros superadmins.

## Requisitos (EARS)

- **R1** — Cuando la app arranca con `SEED_ADMIN_RESET=true`, `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`, el sistema debe dejar al superadmin con ese correo y esa contraseña, activo, con correo confirmado, sin `tenantId`, sin cambio obligatorio ni código de recuperación pendiente, y con todas sus sesiones cerradas.
- **R2** — El superadmin a reiniciar es el SUPERADMIN con ese correo; si no hay, el único SUPERADMIN existente (y se le cambia el correo). Si el correo pertenece a un usuario que no es SUPERADMIN, o hay varios SUPERADMIN y ninguno tiene ese correo, el sistema no debe tocar nada y debe registrar el motivo. Nunca asciende a un usuario de empresa.
- **R3** — Sin `SEED_ADMIN_RESET=true` el arranque no cambia al superadmin existente (comportamiento actual). Tras reiniciarlo, el log avisa de quitar la variable; nunca registra la contraseña.
- **R4** — Si el login responde 401 con un motivo de cuenta (desactivada o empresa suspendida), la pantalla debe mostrarlo; si responde 429, debe decir que hubo demasiados intentos y que espere.
- **R5** — Si «¿Olvidaste tu contraseña?» responde 429, la pantalla debe avisarlo y no pasar a pedir el código. Otros errores mantienen la respuesta genérica (anti-enumeración).
- **R6** — Si Resend devuelve error al enviar un correo, el sistema debe registrarlo como error con el motivo, no como enviado.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1, R3 | Dado un superadmin con otra contraseña, `tenantId`, inactivo y con sesiones, cuando arranca con la variable, entonces entra con la contraseña de la variable y sus refresh tokens quedan revocados; sin la variable no cambia | unitaria `users.service.spec` |
| C2 | R2 | Correo de un TENANT_ADMIN → no se toca nadie; único superadmin con otro correo → se le cambia el correo | unitaria |
| C3 | R4 | 401 «empresa suspendida» y 429 muestran su mensaje | unitaria `login.spec` |
| C4 | R5 | 429 en recuperación avisa y sigue en la vista del correo | unitaria `login.spec` |
| C5 | R6 | `send` devuelve `{ error }` → `logger.error`, no «→ email» | unitaria `mail.service.spec` |
| C6 | — | El usuario pone `SEED_ADMIN_RESET=true` en Coolify, redespliega, entra, quita la variable **[usuario]** | manual |

## Supuestos y decisiones por defecto

- El reinicio corre en `UsersService.onModuleInit`, después de normalizar correos y antes de crear el superadmin si falta.
- Se usan actualizaciones directas a la colección de refresh tokens del mismo módulo (UserSessionsService ya la inyecta).

## Preguntas abiertas

- ninguna
