# HU24 — Reintentar mensajes que no se enviaron (manual y al volver la red)

## Historia

**Como** operador que escribe a clientes desde Conversaciones (incluida la app
móvil),
**quiero** poder reintentar el envío de un mensaje que no se envió y que, si
me quedo sin cobertura de red, los mensajes pendientes se envíen solos cuando
vuelva la conexión,
**para** no perder respuestas ni tener que reescribirlas.

## Contexto

- HU7 (`terminados/2026-11-11-hu7-reintento-mensajes-fallidos`) ya reintenta
  en el backend los mensajes que **Meta rechazó** por errores temporales. Esta
  historia cubre lo que falta:
  1. **Reintento manual**: en un mensaje marcado como fallido (por Meta o por
     error del servidor), una acción "Reintentar" que lo reenvíe.
  2. **Sin red en el dispositivo**: si el mensaje no llega ni al servidor,
     quedarse en la conversación como "pendiente" (no perder el texto/adjunto)
     y enviarse automáticamente, en orden, cuando vuelva la conexión.
- La app móvil es Capacitor (proyecto `mobile`), donde la pérdida de cobertura
  es frecuente.

## Supuestos

- El mensaje pendiente se muestra con un estado visible distinto de "fallido".
- No se debe enviar dos veces el mismo mensaje (reintento idempotente).
- Si el reintento automático falla de forma definitiva, queda como fallido con
  la opción de reintentar a mano.
- Los pendientes sobreviven a cerrar y reabrir la app.
