# HU17 — Restablecer la cuenta del usuario principal · Cierre

- **Cerrada:** 2026-11-18
- **Estado:** Terminada (pendiente revisión visual del usuario)
- **Verificación (spec-verifier):** 4 CUMPLE · 3 PARCIAL (C1, C2, C5), corregidos sin segunda vuelta
- **Commits:** sin commit

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Estado | Evidencia |
|---|---|---|
| C1 principal = admin activo más antiguo | CUMPLE tras corrección | e2e con dos admins y con `owner: null` |
| C2 recuperar en un paso | CUMPLE tras corrección | e2e: token vigente → 401 tras recuperar; modo `email` sin proveedor → 400 sin cambiar el correo |
| C3 otra empresa 404 / no admin 400 | CUMPLE | e2e |
| C4 nombrar existente o nuevo | CUMPLE | e2e |
| C5 registro sin contraseñas | CUMPLE tras corrección | e2e de `tenant_audit` y de `user_audit` |
| C6 solo SUPERADMIN | CUMPLE | e2e 403 |
| C7 bloque y diálogos en la ficha | CUMPLE | `tenant-detail.spec.ts` |

## Correcciones tras la verificación

- **Alto:** en modo `email` sin proveedor de correo se cambiaba el correo y se reactivaba antes de fallar. Ahora se comprueba antes de tocar nada (`assertResetPossible`).
- Nombrar a un admin desactivado registra la reactivación, no un cambio de rol vacío.

## Riesgos aceptados

- Si el plan llegó al límite de usuarios, no se puede crear un admin nuevo: hay que nombrar a uno existente.

## Lo que tiene que hacer el usuario

- Probar «Recuperar cuenta» en una empresa de prueba y entrar con la contraseña temporal.
