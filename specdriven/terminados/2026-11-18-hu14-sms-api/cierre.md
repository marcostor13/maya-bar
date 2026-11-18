# HU14 — Enviar SMS desde la API de integraciones · Cierre

- **Cerrada:** 2026-11-18
- **Estado:** Terminada (pendiente prueba real con el proveedor SMS del usuario)
- **Verificación (spec-verifier):** 10 CUMPLE · 0 PARCIAL · 0 NO CUMPLE
- **Commits:** sin commit. Va junto con HU15: `ApiSmsService` avisa por el webhook de salida.

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Estado | Evidencia |
|---|---|---|
| C1 proveedor SMS como cuenta compartible | CUMPLE | `api-access.service.ts` accounts; unitaria y e2e C1 |
| C2 aislamiento por empresa | CUMPLE | `ownedAccount`; e2e C2 → 404 |
| C3 envío, registro y log enmascarado | CUMPLE | `api-sms.service.ts`; unitaria y e2e C3 |
| C4 «No contactar» → 422 | CUMPLE | unitaria y e2e C4 |
| C5 solo texto, ≤1600, número válido → 400 | CUMPLE | unitaria `it.each` |
| C6 proveedor inactivo → 409 | CUMPLE | unitarias |
| C7 cuota e idempotencia | CUMPLE | índice único parcial; e2e con `Idempotency-Key` |
| C8 estado por acceso | CUMPLE | e2e (otra clave → 404) |
| C9 fallo del proveedor → `failed` + error | CUMPLE | unitaria C9 |
| C10 pantalla Integraciones con SMS | CUMPLE | `integrations.spec.ts` HU14 C10 |

## Correcciones tras la verificación

- El `error` que devuelve la API ya no incluye el cuerpo de respuesta del proveedor, que podía hacer eco de usuario o clave (`publicSmsError`). Tiene prueba.
- La ayuda de la pantalla aclara que en SMS no hay `conversationId` y que un `201` puede traer `status: "failed"`.

## Riesgos aceptados

- La cuota se consume antes de comprobar el proveedor y «No contactar» (mismo orden que HU13).
- Si el proceso cae entre crear y guardar el registro, queda `pending`.

## Lo que tiene que hacer el usuario

- Crear un acceso de canal SMS en Integraciones y enviar un SMS real con su proveedor configurado.
