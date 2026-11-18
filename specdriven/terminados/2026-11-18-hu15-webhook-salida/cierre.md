# HU15 — Webhook de salida para las integraciones · Cierre

- **Cerrada:** 2026-11-18
- **Estado:** Terminada (pendiente prueba real contra un endpoint del usuario)
- **Verificación (spec-verifier):** 8 CUMPLE · 1 PARCIAL (C2, corregido sin segunda vuelta)
- **Commits:** sin commit

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Estado | Evidencia |
|---|---|---|
| C1 URL https pública, secreto una vez y cifrado | CUMPLE | `setUrl`, `checkUrl`; unitaria y e2e |
| C2 rotar y quitar | CUMPLE tras corrección | prueba nueva de `removeUrl`; la spec decía `hasWebhook`, la vista usa `webhookUrl` (spec ajustada) |
| C3 estados sin duplicar | CUMPLE | índice único `(accessId, refId, event)`; e2e |
| C4 `message.received` solo en conversaciones de la integración | CUMPLE | e2e |
| C5 firma HMAC y cabeceras | CUMPLE | unitaria recalcula la firma |
| C6 reintentos y `failed` tras 6 | CUMPLE | unitaria |
| C7 prueba y lista de avisos | CUMPLE | e2e `ping`; `integrations.spec.ts` |
| C8 aislamiento por empresa | CUMPLE | e2e → 404 |
| C9 avisos de SMS | CUMPLE | unitarias |

## Correcciones tras la verificación

- El modal del secreto rotado se abría debajo del modal «Avisos»: ahora va encima (`.overlay-top`).
- `rotateSecret` rechaza accesos revocados.

## Riesgos aceptados

- DNS rebinding: el host se valida antes de cada envío, pero `fetch` resuelve otra vez.
- `message.failed` sale al primer fallo aunque el reintento automático (HU7) lo reenvíe después.

## Lo que tiene que hacer el usuario

- Poner la URL de su sistema en un acceso, pulsar «Enviar prueba» y validar la firma con el secreto.
