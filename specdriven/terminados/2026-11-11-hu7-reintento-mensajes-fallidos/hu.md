# HU7 — Reintento automático de mensajes de WhatsApp fallidos

## Historia

**Como** empresa que atiende por WhatsApp con el agente IA o con operadores,
**quiero** que las respuestas que Meta rechazó por un problema temporal de mi
cuenta (facturación, límite de envío, caída de Meta) se reenvíen solas cuando
el problema se resuelva,
**para** que los clientes que escribieron mientras tanto no se queden sin
respuesta.

## Contexto

- 2026-11-10/11: la WABA de Farma Center no tenía moneda configurada y Meta
  rechazó 41 respuestas con `#131042 Business eligibility payment issue`.
  Tras arreglarlo en Meta se reenviaron a mano (script) solo la última
  respuesta de cada conversación, dentro de la ventana de 24 h.
- El usuario eligió esa regla: **solo la última respuesta fallida por
  conversación**, para no mandar saludos repetidos.
