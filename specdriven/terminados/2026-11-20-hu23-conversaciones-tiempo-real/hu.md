# HU23 — Conversaciones en tiempo real

## Historia

**Como** operador o administrador que atiende clientes en Conversaciones,
**quiero** que la bandeja y la conversación abierta se actualicen en tiempo
real cuando se envía o se recibe un mensaje (sin recargar la página),
**para** responder a tiempo y no trabajar sobre información desactualizada.

## Contexto

- Ya existe una conexión por socket (`frontend/src/app/shared/conversations-realtime.ts`,
  usada en `pages/inbox/inbox.ts` y `layout/shell/shell.ts`), pero en la
  práctica los mensajes enviados/recibidos no siempre aparecen sin recargar.
  Investigar qué eventos se emiten y cuáles faltan o no se escuchan.
- Debe cubrir: mensajes entrantes del cliente, respuestas del agente IA,
  mensajes de otros operadores y los enviados desde la API/campañas.
- Debe actualizar tanto la conversación abierta como la lista (último
  mensaje, orden, no leídos) y el estado de cada mensaje (enviado, entregado,
  leído, fallido).

## Supuestos

- Aplica a todos los canales que ya llegan a Conversaciones.
- Si el socket se cae, debe reconectar solo y recuperar lo que llegó mientras
  tanto (sin duplicar mensajes).
