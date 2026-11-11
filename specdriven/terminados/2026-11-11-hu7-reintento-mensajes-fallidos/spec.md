# HU7 — Reintento automático de mensajes de WhatsApp fallidos · Especificación

Historia: `backlog/hu7-reintento-mensajes-fallidos.md` · Fecha: 2026-11-11 · Estado: aprobada

## Objetivo

Que una respuesta de WhatsApp que Meta rechazó por un problema temporal de la
cuenta o de Meta se reenvíe sola cuando el problema desaparezca, sin que nadie
tenga que revisar la bandeja. Evita perder clientes que escribieron durante una
caída o un problema de facturación.

## Usuarios

- Empresa (TENANT_ADMIN, operadores): sus clientes reciben la respuesta aunque
  la cuenta haya estado bloqueada un rato.
- Cliente final: recibe una sola respuesta útil, no una ráfaga de saludos.

## Alcance

- Incluye: mensajes salientes de WhatsApp (Cloud API) escritos por el agente IA
  o por un operador, que fallaron con un error temporal; un proceso en segundo
  plano que los reintenta con espera creciente; actualización del estado en la
  bandeja por socket.
- **Fuera de alcance:** Messenger, Instagram, email y SMS; campañas y
  plantillas (tienen su propio envío y reintento); indicador visual nuevo en la
  bandeja ("se reintentará"); reenvío fuera de la ventana de 24 h (exigiría
  plantilla); reintento manual con botón.

## Requisitos (EARS)

Funcionales:
- **R1** — Cuando un mensaje saliente de WhatsApp de autor `agent` o `human`
  queda `failed` con un error temporal (códigos de Meta 131042, 131057, 131000,
  131016, 133004, 130429, 131056, 190, o un fallo de conexión en el que la petición no llegó a Meta: ECONNREFUSED, ENOTFOUND, EAI_AGAIN; un timeout o corte a mitad no se reintenta porque duplicaría el mensaje),
  el sistema debe reintentar su envío automáticamente.
- **R2** — El sistema debe reintentar solo el último mensaje saliente fallido
  de cada conversación; los fallidos anteriores de esa conversación no se
  reenvían y se marcan como descartados para el reintento.
- **R3** — Si después del mensaje fallido ya salió otro mensaje al cliente (agente u operador; las notas internas no cuentan) en la
  conversación, entonces el sistema no debe reintentarlo.
- **R4** — Si el último mensaje del cliente en la conversación tiene más de
  24 h (menos un margen de 5 min), entonces el sistema no debe reintentar y debe
  marcar el mensaje como descartado.
- **R5** — Si el error no es temporal (p. ej. 131047 fuera de ventana, 131026
  no entregable, 131049, 131048), entonces el sistema no debe reintentar.
- **R6** — Cuando un reintento sale bien, el sistema debe pasar el mensaje a
  `sent`, guardar el nuevo `externalId`, borrar el error y avisar a la bandeja
  por socket (los acks posteriores lo llevan a entregado/leído).
- **R7** — Cuando un reintento vuelve a fallar con un error temporal, el sistema
  debe programar el siguiente con espera creciente (2, 5, 10, 20, 30 y luego
  cada 60 min) mientras dure la ventana de 24 h.
- **R8** — Si en una pasada falla el reintento de una cuenta de WhatsApp, el
  sistema no debe intentar más mensajes de esa misma cuenta en esa pasada
  (los aplaza al mismo turno), para no golpear a Meta con envíos que van a
  fallar igual.
- **R9** — Si la conversación está bloqueada o en la papelera, entonces el
  sistema no debe reintentar.

No funcionales:
- **R10** (idempotencia) — Con varias instancias del backend, un mismo mensaje
  no debe enviarse dos veces en la misma pasada: cada mensaje se reclama con una
  actualización atómica.
- **R11** (rendimiento) — La consulta de candidatos usa un índice parcial sobre
  mensajes fallidos y procesa como máximo 50 por pasada (cada minuto).
- **R12** (operación) — El reintento se puede apagar con `WA_AUTO_RETRY=false`.
- **R13** (privacidad) — Los logs solo llevan ids y códigos de error, nunca el
  texto del mensaje ni el teléfono.
- **R14** — Los errores devueltos al enviar por Cloud API deben incluir el
  código de Meta (`#131042`) para poder clasificarlos igual que los del webhook.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1, R5 | Dado un error `#131042 …`, `CloudAPI 400 #130429: …` o `ENOTFOUND`, cuando se clasifica, entonces es temporal; con `#131047`, `#131026`, `ETIMEDOUT`, `fetch failed` o sin código conocido, no | unitaria (política) |
| C2 | R7 | Dado el número de intentos 0…7, entonces la espera es 2, 5, 10, 20, 30, 60, 60… min | unitaria (política) |
| C3 | R1, R6 | Dado un fallido temporal del agente con el cliente dentro de 24 h, cuando corre la pasada, entonces se reenvía, queda `sent` con el nuevo `externalId`, sin `error`, y se emite `messageUpdated` | unitaria (servicio) |
| C4 | R2 | Dados dos fallidos en la misma conversación, cuando corre la pasada, entonces solo se envía el más reciente y el anterior queda descartado | unitaria (servicio) |
| C5 | R3 | Dado un fallido seguido de un saliente exitoso, entonces no se envía y queda descartado | unitaria (servicio) |
| C6 | R4 | Dado un fallido cuyo último mensaje entrante tiene 25 h, entonces no se envía y queda descartado | unitaria (servicio) |
| C7 | R5 | Dado un fallido con `#131047`, entonces no se envía y queda descartado | unitaria (servicio) |
| C8 | R7 | Dado un reintento que vuelve a fallar con `#131042`, entonces queda `failed`, `retryCount` +1 y `retryAt` según la espera | unitaria (servicio) |
| C9 | R8 | Dados dos fallidos de la misma cuenta en conversaciones distintas, cuando el primero vuelve a fallar, entonces el segundo no se intenta en esa pasada | unitaria (servicio) |
| C10 | R9 | Dada una conversación bloqueada o en papelera, entonces no se envía | unitaria (servicio) |
| C11 | R10 | Dado que otra instancia ya reclamó el mensaje (la actualización atómica no lo devuelve), entonces no se envía | unitaria (servicio) |
| C12 | R12 | Dado `WA_AUTO_RETRY=false`, cuando corre la pasada, entonces no consulta ni envía nada | unitaria (servicio) |
| C13 | R14 | Dado que Meta responde un error con `code: 131042` al enviar, entonces el error lanzado contiene `#131042` | unitaria (whatsapp.service) |
| C14 | R11 | El esquema de mensajes declara el índice parcial de fallidos | revisión de código |
| C15 | R1–R6 | Con la cuenta real de un cliente, tras un rechazo temporal arreglado, la respuesta llega sola | manual **[usuario]** |

## Supuestos y decisiones por defecto

- 131048 (límite por spam) **no** se reintenta: insistir empeora la calidad del
  número.
- 190 (token caducado) sí: el usuario suele reconectar en minutos.
- El primer intento se hace 2 min después del fallo, para que no coincida con
  el mismo problema puntual.
- Se reutiliza el envío normal (`deliver`): texto, imagen, video, audio y
  documento, con BSUID incluido.
- Reintento sin cita (`replyTo`) si el citado no tiene `externalId`: ya lo hace
  `deliver`.

## Preguntas abiertas

- Ninguna (la regla "solo la última" la eligió el usuario).
