# HU24 — Reintentar mensajes que no se enviaron · Especificación

Historia: `hu.md` · Fecha: 2026-11-20 · Estado: aprobada

## Objetivo

Que ningún mensaje escrito en la bandeja se pierda: si no llega al servidor por
falta de red queda en cola y sale solo al volver la conexión; si falló (Meta o
servidor) se puede reintentar a mano, sin duplicarlo nunca.

## Requisitos

- R1 — Cada envío de la bandeja lleva un `clientId` generado en el dispositivo.
  El servidor guarda el mensaje con él (índice único por empresa) y, si le
  llega otra vez, devuelve el mismo mensaje sin volver a enviarlo. Un
  `clientId` ya usado en otro chat → 409; con formato inválido → 400.
- R2 — `POST /conversations/:id/messages/:messageId/retry` reintenta un mensaje
  fallido escrito a mano en la bandeja (no los de la API ni los del agente): lo
  pasa a `pending` de forma atómica (dos clics no lo envían dos veces), lo
  vuelve a entregar y publica el estado por el socket. Si vuelve a fallar queda
  fallido, sin reintento automático, listo para reintentarlo a mano.
- R3 — Cola local (`OutboxService`): todo envío se guarda en `localStorage`
  (por usuario) hasta que el servidor confirma que lo guardó. Sobrevive a
  cerrar y reabrir la app.
- R4 — Si el envío falla por red (sin respuesta del servidor), el mensaje queda
  en la conversación como **"Sin conexión · se enviará al volver la red"**
  (estado `queued`, distinto de fallido) y se reenvía solo, **en orden**, al
  volver la red, al reconectar el socket o al abrir la app. También cuando la
  pasarela responde sin backend (502/503/504) o la petición pasa de 30 s.
- R5 — Si el servidor lo rechaza (4xx/5xx), queda fallido (en la cola, para no
  perder el texto) con la acción **Reintentar**, que lo reenvía con el mismo
  `clientId`.
- R6 — En un mensaje fallido del servidor (Meta rechazó o error al entregar),
  **Reintentar** llama al endpoint de R2.
- R7 — Los adjuntos ya subidos viajan en la cola (su URL); el texto y el
  adjunto no se pierden.

## Criterios de aceptación

- C1 — Mismo `clientId` dos veces → mismo mensaje, uno solo en la base; en otro
  chat → 409; inválido → 400. (e2e de API)
- C2 — Reintento de un fallido → `pending`; si está pendiente → 409; repetible
  tras volver a fallar; no crea mensajes nuevos. (e2e de API)
- C3 — No se reintentan los enviados, los de la API ni los de otra empresa.
  (e2e de API)
- C4 — La cola persiste en `localStorage` y se recarga al crear el servicio.
- C5 — Sin red (o 502/503/504, o 30 s sin respuesta) el envío queda `queued`; al volver la red o al abrir la app se envían en orden y
  salen de la cola; un fallo de red detiene la tanda sin perder nada.
- C6 — Un rechazo del servidor deja el mensaje `failed` en la cola;
  `retry` lo vuelve a poner en cola y lo envía con el mismo `clientId`.
- C7 — La bandeja muestra el estado "Sin conexión" y el botón Reintentar en
  los fallidos escritos a mano; Reintentar en uno del servidor llama a R2.
- C8 — `npm run verify` en verde.
- C9 — [usuario] En la app móvil, en modo avión: escribir, cerrar la app,
  volver a abrirla con red y comprobar que el mensaje sale una sola vez.

## Fuera de alcance

- Subir un adjunto sin red: la subida a S3 se hace al adjuntarlo; sin red falla
  allí con su aviso, antes de enviar.
