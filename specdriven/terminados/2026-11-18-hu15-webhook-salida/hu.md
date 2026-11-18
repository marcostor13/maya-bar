# HU15 — Aviso a mi sistema cuando cambia un mensaje enviado por API (webhook de salida)

## Historia

**Como** empresa que envía mensajes con la API de integraciones (HU13),
**quiero** registrar una URL de mi sistema para que Maya me avise,
**para** saber sin consultar cuándo un mensaje se entrega, se lee o falla, y cuándo el contacto responde.

## Contexto

HU13 solo permite consultar el estado (`GET /public/v1/messages/:id`). La historia de HU13 pedía dejar el aviso anotado como siguiente historia.

## Qué se espera

- Por acceso: URL https de aviso y un secreto para firmar (HMAC) cada aviso.
- Eventos: `message.sent`, `message.delivered`, `message.read`, `message.failed` y `message.received` (respuesta del contacto en esa conversación).
- Reintentos con espera creciente si mi sistema no responde 2xx; registro de los últimos avisos en la pantalla.
