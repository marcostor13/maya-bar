# HU20 — Datos por usuario en el dashboard · Cierre

- **Cerrada:** 2026-11-18
- **Estado:** Terminada (pendiente revisión del usuario en producción)
- **Verificación (spec-verifier):** 3 CUMPLE · 2 PARCIAL (C2, C4: chats cerrados contaban) — corregidos sin segunda vuelta
- **Commits:** ver `git log` (subida a main)

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Estado | Evidencia |
|---|---|---|
| C1 `sentBy` en envío manual | CUMPLE | `conversations.email.spec.ts`; índice parcial en `message.schema.ts` |
| C2 una fila por usuario, aislado | CUMPLE tras corrección | `dashboard-users.service.ts`; e2e `dashboard-users` (chat cerrado no cuenta) |
| C3 no supervisor ve su fila | CUMPLE | e2e |
| C4 filtro por canal | CUMPLE tras corrección | e2e |
| C5 tabla ordenable, totales, vacío y error | CUMPLE | `user-performance-card.spec.ts` |

## Correcciones tras la verificación

- «Chats asignados» solo cuenta los abiertos.
- Nuevas columnas «A su cargo» y «Sin seguimiento» (contactos sin actividad manual en el periodo), para ver quién no trabaja sus contactos (la historia lo pedía).
- Ganados y valor ganado en una sola agregación.
- La tarjeta cancela la petición anterior al cambiar periodo o canal.

## Riesgos aceptados

- Mensajes manuales anteriores al 2026-08-25 no tienen `sentBy` y no se atribuyen.
- No hay prueba de que el dashboard pase `range` y `channel` a la tarjeta (se cubre en la propia tarjeta).

## Lo que tiene que hacer el usuario

- Revisar la tabla en el dashboard de producción con datos reales.
