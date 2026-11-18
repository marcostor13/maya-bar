# HU14 — Enviar SMS desde la API de integraciones · Especificación

Historia: `hu.md` · Fecha: 2026-11-18 · Estado: aprobada

## Objetivo

Que la empresa envíe SMS desde su web o su sistema con la misma API de HU13
(clave, dominios/IPs autorizados, límites), usando el proveedor SMS genérico
que ya tiene configurado en Configuración → SMS.

## Usuarios

- Administrador de la empresa (módulo Integraciones): crea el acceso ligado al proveedor SMS.
- Sistema externo de la empresa: llama a `POST /public/v1/messages`.

## Alcance

- Incluye: canal `sms` en los accesos, envío de texto, consulta de estado,
  registro del envío, «No contactar», límites e idempotencia.
- **Fuera de alcance:** estados de entrega del operador (el proveedor genérico
  no tiene webhook de acuse; el estado final es `sent` o `failed`), adjuntos y
  plantillas por SMS, bandeja de chat para SMS.

## Requisitos (EARS)

- **R1** — Cuando el administrador abre «Nuevo acceso», el sistema debe ofrecer
  el proveedor SMS de la empresa como cuenta (inactiva si el proveedor está
  desactivado o sin URL).
- **R2** — Cuando se crea un acceso `sms`, el sistema debe comprobar que el
  proveedor pertenece a la empresa del usuario.
- **R3** — Cuando llega `POST /public/v1/messages` con clave de un acceso `sms`,
  `to` internacional y `text`, el sistema debe enviar el SMS por el proveedor
  de la empresa y responder `201` con `id`, `status` (`sent`/`failed`),
  `channel: "sms"`, `to`, `segments` y `createdAt`.
- **R4** — Si el número está en «No contactar», entonces el sistema debe
  responder `422` sin enviar.
- **R5** — Si el cuerpo trae `mediaUrl` o `template`, falta `text`, el texto
  supera 1600 caracteres o `to` no es un número válido, entonces `400`.
- **R6** — Si el proveedor SMS ya no está activo, entonces `409`.
- **R7** — El envío consume la cuota por minuto y día del acceso (429 con
  `Retry-After`) y respeta `Idempotency-Key` (repetir devuelve `200` con el
  mismo mensaje, sin reenviar).
- **R8** — Cuando se consulta `GET /public/v1/messages/:id` de un SMS del
  acceso, el sistema debe devolver su estado; un id de otro acceso da `404`.
- **R9** — Cada envío queda registrado (colección `api_sms_messages`, contador
  y último uso del acceso, log con el número enmascarado).
- **R10** (seguridad) — Los secretos del proveedor nunca salen en respuestas ni
  logs; aislamiento por empresa en todas las rutas.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | Dada una empresa con proveedor SMS, cuando pide `/api-access/accounts`, entonces aparece `{channel:'sms'}` | e2e API |
| C2 | R2 | Cuando crea un acceso `sms` con el id del proveedor de otra empresa, entonces `404` | e2e API |
| C3 | R3, R9 | Cuando envía `to`+`text`, entonces `201`, el proveedor recibe el número E.164 y el texto, y el envío queda en `api_sms_messages` | e2e API + unitaria |
| C4 | R4 | Dado un número en «No contactar», entonces `422` y no se llama al proveedor | unitaria + e2e |
| C5 | R5 | `mediaUrl`, `template`, sin texto o número inválido → `400` | unitaria |
| C6 | R6 | Proveedor desactivado → `409` | unitaria |
| C7 | R7 | Mismo `Idempotency-Key` → `200`, una sola llamada al proveedor | e2e API |
| C8 | R8 | `GET` del id devuelve el estado; con otra clave → `404` | e2e API |
| C9 | R3 | Si el proveedor falla, entonces `201` con `status: failed` y `error` | unitaria |
| C10 | R1 | La pantalla Integraciones muestra «SMS» en la lista de cuentas y en la documentación | unitaria frontend |

## Supuestos y decisiones por defecto

- El «id de cuenta» de un acceso SMS es el `_id` de `SmsConfig` (uno por empresa).
- El SMS no crea conversación (no hay bandeja SMS); se registra en su propia
  colección. `conversationId` no se devuelve para SMS.
- Segmentos: GSM-7 160/153, si no UCS-2 70/67 (se guarda para el costo de HU18).

## Preguntas abiertas

- Ninguna.
