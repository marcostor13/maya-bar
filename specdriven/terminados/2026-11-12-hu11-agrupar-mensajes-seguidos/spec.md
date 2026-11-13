# HU11 — Agrupar los mensajes seguidos del cliente y responder una sola vez · Especificación

Historia: `backlog/hu11.md` · Fecha: 2026-11-12 · Estado: aprobada

## Objetivo

Hoy cada mensaje entrante dispara su propia respuesta del agente, y una ráfaga
de mensajes produce respuestas repetidas o contradictorias. El agente esperará
unos segundos, leerá juntos todos los mensajes pendientes y responderá una
sola vez, sin respuestas en paralelo en la misma conversación.

## Usuarios

- Empresa con agentes IA: una respuesta coherente por turno.
- Cliente final: no recibe respuestas duplicadas ni contradictorias.

## Alcance

- Incluye: espera configurable (global y por agente), candado por
  conversación en Mongo, agrupación de los mensajes pendientes, recuperación si
  una instancia se cae, campo "Espera antes de responder" en el editor del
  agente, pruebas.
- **Fuera de alcance:**
  - Cambiar cómo se interpretan audios/imágenes (ya se interpretan antes de
    marcar el mensaje como pendiente).
  - Agrupar mensajes de canales distintos o de conversaciones distintas.
  - El indicador "escribiendo…" en la recuperación tras caída de una
    instancia (no se tiene la configuración del canal; se responde sin él).

## Requisitos (EARS)

Funcionales:
- **R1** — Cuando llega un mensaje del cliente que el agente debe atender, el
  sistema debe marcarlo como pendiente y programar la respuesta para dentro de
  la espera configurada; cada mensaje nuevo reinicia la espera.
- **R2** — Cuando vence la espera, el sistema debe generar una sola respuesta
  con todos los mensajes pendientes de esa conversación, en orden, y quitarles
  la marca.
- **R3** — Si llega un mensaje mientras el agente genera una respuesta en esa
  conversación, entonces no debe lanzarse otra en paralelo: queda pendiente y
  se responde en la pasada siguiente, con lo ya enviado en el historial.
- **R4** — Los mensajes vacíos o que no se pudieron interpretar
  (`unsupported`) quedan pendientes pero no programan una respuesta propia; se
  juntan con el siguiente mensaje que sí la programe.
- **R5** — Si, al vencer la espera, el chat ya no está en automático
  (persona tomó el chat, derivado, cerrado, bloqueado o en la lista de no
  contactar), el sistema no responde y descarta los pendientes.
- **R6** — La espera es `AGENT_REPLY_DEBOUNCE_MS` (por defecto 6000 ms); un
  agente puede fijar la suya entre 0 y 30 s. Con 0 se responde enseguida, pero
  igual de a una pasada por conversación.
- **R7** — Si la instancia que programó la respuesta se cae, otra instancia
  debe responder los pendientes vencidos en menos de un minuto.

No funcionales:
- **R8 (concurrencia)** — Varias instancias: el reclamo de la conversación es
  atómico en Mongo y caduca (90 s) para no quedar bloqueado si una instancia
  muere.
- **R9 (compatibilidad)** — Mensajes y conversaciones existentes no se ven
  afectados (los campos nuevos son opcionales); la ventana de 24 h de
  WhatsApp, la idempotencia de citas y "escribiendo…" se mantienen.
- **R10 (privacidad)** — Los logs llevan ids, nunca el texto del cliente.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1, R2 | Dados 3 mensajes en ráfaga dentro de la espera, cuando vence, el agente se llama una vez con los 3 textos en orden y se envía una respuesta | unitaria (temporizador simulado) |
| C2 | R1 | Cada mensaje reinicia la espera: con espera de 6 s, mensajes a 0 s y 4 s responden a los 10 s, no a los 6 s | unitaria |
| C3 | R3 | Un mensaje que llega durante la generación no lanza otra llamada en paralelo; al terminar la primera, se genera una segunda respuesta con ese mensaje y la primera respuesta en el historial | unitaria |
| C4 | R4 | Un mensaje `unsupported` solo no genera respuesta; seguido de un texto, ambos van en la misma llamada | unitaria |
| C5 | R5 | Si una persona toma el chat durante la espera, no se responde y los pendientes se descartan | unitaria |
| C6 | R6 | Con espera 0 un mensaje suelto se responde igual que hoy (correo y demás pruebas existentes en verde); el agente con `replyDelaySeconds` usa su valor | unitarias existentes + nueva |
| C7 | R7, R8 | El reclamo usa `findOneAndUpdate` con caducidad; si otra instancia lo tiene, no se responde; la recuperación periódica atiende conversaciones vencidas | unitaria |
| C8 | R6 | El editor del agente muestra y guarda "Espera antes de responder (s)" (0–30) y el DTO rechaza valores fuera de rango | unitaria DTO + `tsc` del frontend |
| C9 | — | Prueba real en WhatsApp: varios mensajes seguidos → una respuesta **[usuario]** | manual |

## Supuestos y decisiones por defecto

- Espera por defecto 6 s (la historia sugiere 5–8 s).
- Pendiente = marca `agentPending` en el mensaje (no "posterior al último
  saliente"): un mensaje que llega durante la generación es anterior a la
  respuesta y se perdería con el otro criterio.
- Los pendientes de más de 15 min se descartan en vez de responderse tarde
  (p. ej. un `unsupported` suelto que nunca tuvo compañía).
- Varios pendientes se unen con salto de línea en un solo mensaje de usuario;
  el historial excluye los pendientes.
- Recuperación cada 15 s (`@Interval`), solo para conversaciones con la espera
  vencida hace más de 10 s (las normales las atiende su temporizador).

## Preguntas abiertas

- Ninguna.
