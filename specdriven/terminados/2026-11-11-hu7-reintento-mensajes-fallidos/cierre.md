# HU7 — Reintento automático de mensajes de WhatsApp fallidos · Cierre

- **Cerrada:** 2026-11-11
- **Estado:** Terminada (pendiente prueba real del usuario, C15)
- **Verificación (spec-verifier):** 13 CUMPLE · 1 PARCIAL (C5) · 1 NO VERIFICADO [usuario]; C5 corregido después, sin segunda vuelta
- **Commits:** sin commit

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Clasificación de errores temporales | CUMPLE | `message-retry.policy.ts`, `message-retry.policy.spec.ts` |
| C2 | Esperas 2/5/10/20/30/60 min | CUMPLE | `message-retry.policy.spec.ts` |
| C3 | Reenvío exitoso → `sent`, nuevo `externalId`, socket | CUMPLE | `message-retry.service.spec.ts` (C3) |
| C4 | Solo el último fallido por conversación | CUMPLE | `message-retry.service.spec.ts` (C4) |
| C5 | Descarta si ya salió otra respuesta al cliente | CUMPLE (tras corrección) | consulta de posteriores con `author ∈ {agent, human}` e `inTrash ≠ true`; prueba "notas internas" |
| C6 | Ventana de 24 h cerrada → descartado | CUMPLE | `message-retry.service.spec.ts` (C6) |
| C7 | Error no temporal → no se reintenta | CUMPLE | `message-retry.service.spec.ts` (C7) |
| C8 | Nuevo fallo temporal → siguiente intento | CUMPLE | `message-retry.service.spec.ts` (C8) |
| C9 | Una sonda por cuenta y pasada | CUMPLE | `message-retry.service.spec.ts` (C9) |
| C10 | Bloqueada / papelera / otro canal | CUMPLE | `message-retry.service.spec.ts` (C10) |
| C11 | Reclamo atómico | CUMPLE | `message-retry.service.spec.ts` (C11) |
| C12 | `WA_AUTO_RETRY=false` | CUMPLE | `message-retry.service.spec.ts` (C12) |
| C13 | Código de Meta en el error de envío | CUMPLE | `whatsapp.service.spec.ts` |
| C14 | Índice parcial de fallidos | CUMPLE | `message.schema.ts` |
| C15 | Prueba real con cuenta del cliente | NO VERIFICADO [usuario] | — |

## Qué se implementó

- `whatsapp.service.ts`: los errores de envío por Cloud API llevan el código de Meta (`CloudAPI 400 #131042: …`).
- `conversations/message-retry.policy.ts`: errores temporales (131042, 131057, 131000, 131016, 133004, 130429, 131056, 190 y fallos de conexión que no llegaron a Meta) y esperas crecientes.
- `message.schema.ts`: `retryCount`, `retryAt`, `retryStopped` e índice parcial sobre fallidos.
- `ConversationsService.redeliver`: envoltorio público del envío.
- `conversations/message-retry.service.ts`: cron cada minuto, máx. 50 por pasada; solo el último saliente fallido por conversación, dentro de 24 h − 5 min; respeta bloqueo y papelera; reclamo atómico; una sonda por cuenta; aviso por socket; apagable con `WA_AUTO_RETRY=false` (documentado en `backend/.env.example`).

Correcciones tras el verificador:
- Las notas internas (`system`: derivación, llamadas, pausa del agente) ya no cuentan como "respuesta posterior". Antes, el mensaje de derivación fallido se descartaba.
- Timeouts y cortes a mitad (`ETIMEDOUT`, `ECONNRESET`, `fetch failed`) ya no se reintentan: Meta pudo haberlo enviado y el cliente lo recibiría dos veces.
- Aplazar y descartar solo actúan si el mensaje no fue reclamado entretanto (`retryAt` leído).

## Lo que tiene que hacer el usuario

- Nada para activarlo: viene encendido. Para apagarlo, `WA_AUTO_RETRY=false` en las variables del backend en Coolify.
- C15: la próxima vez que Meta rechace por un problema de cuenta, comprobar que, al arreglarlo, la última respuesta de cada chat llega sola.

## Pruebas

- `backend: npm run build` → OK
- `backend: npm test` → 112 suites, 1508/1508
- `backend: eslint src/**/*.ts` → 0 errores
- `frontend: npx ng test frontend --watch=false` → 69 archivos, 727/727
- `frontend: npm run build` → OK

## Pendientes, riesgos y notas

- Si `save()` falla justo después de un reenvío exitoso, el candado caduca a los 10 min y podría reenviarse una vez más (riesgo bajo, aceptado).
- 131056 (límite por destinatario) aplaza toda la cuenta en esa pasada: frena de más, pero es inocuo.
- Sin e2e: el stub de Meta no simula rechazos; cubierto con unitarias.
