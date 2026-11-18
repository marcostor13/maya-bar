# HU19 — Administración total de usuarios y contraseñas · Cierre

- **Cerrada:** 2026-11-18
- **Estado:** Terminada (pendiente revisión visual del usuario)
- **Verificación (spec-verifier):** 6 CUMPLE · 1 PARCIAL (C7, corregido sin segunda vuelta)
- **Commits:** sin commit

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Estado | Evidencia |
|---|---|---|
| C1 contraseña elegida con cambio obligatorio | CUMPLE | `resetAccess` modo `manual`; e2e |
| C2 sin cambio obligatorio | CUMPLE | e2e |
| C3 validación → 400 | CUMPLE | DTO 8–72; e2e |
| C4 cerrar sesiones | CUMPLE | `revokeSessions`; e2e (access y refresh 401, la contraseña sigue) |
| C5 a sí mismo 403 / otra empresa 404 | CUMPLE | e2e |
| C6 registro sin contraseña | CUMPLE | `revoke_sessions`; e2e |
| C7 interfaz | CUMPLE tras corrección | diálogo, «Cerrar sesiones» y marca también en `/admin/users` (superadmin); pruebas unitarias |

## Correcciones tras la verificación

- La pantalla del superadministrador tiene «Cerrar sesiones» y la marca «Debe cambiar la contraseña».
- El límite de 72 se comprueba en bytes (bcrypt ignora lo que pasa de 72 bytes).

## Lo que tiene que hacer el usuario

- Probar en Usuarios: «Restablecer» → «Elegir contraseña», y «Cerrar sesiones».
