# HU11 — Agrupar los mensajes seguidos del cliente y responder una sola vez

## Historia

**Como** empresa que atiende con agentes IA,
**quiero** que, cuando un cliente manda varios mensajes seguidos, el agente
espere unos segundos, los lea todos juntos y responda una sola vez,
**para** que no conteste cada mensaje por separado, con respuestas repetidas o
contradictorias.

## Problema observado

- Producción, conversación `6af15dc7b6891cbc64149331` (2026-11-09 05:44): el
  contacto mandó un mensaje vacío y, enseguida, un texto. El agente respondió
  dos veces en el mismo minuto, y las respuestas se contradecían ("¿quieres que
  se la pase a Oswald?" y "por ahora no estamos buscando patrocinio").
- Hoy cada entrante dispara `ConversationsService.runAgent` por separado
  (`conversations.service.ts`, ≈ línea 1864). La regla de oro 6 del prompt ("un
  solo mensaje por turno") no se puede cumplir, porque cada llamada solo ve su
  propio mensaje.

## Alcance pedido

1. Espera breve configurable (p. ej. `AGENT_REPLY_DEBOUNCE_MS`, unos 5–8 s, con
   opción por agente): cada mensaje nuevo del mismo cliente reinicia la espera.
   Al terminar, el agente genera una sola respuesta con todos los mensajes
   pendientes.
2. Si llega un mensaje mientras el agente está generando, no se lanza otra
   respuesta en paralelo: se encola y se responde en la siguiente pasada,
   teniendo en cuenta lo que ya se envió.
3. Los mensajes vacíos o que no se pueden interpretar (`unsupported`) no
   disparan una respuesta propia; se juntan con los demás.
4. Los mensajes que una persona del equipo responde a mano o que llegan con el
   agente pausado o derivado no se responden (se mantiene lo que ya existe).

## Contexto y supuestos a validar en la spec

- El backend puede correr en más de una instancia: la espera y el candado por
  conversación deben guardarse en Mongo (reclamo atómico, como en HU7), no
  solo en memoria.
- Las transcripciones de audio y las imágenes con descripción deben estar
  listas antes de responder.
- La ventana de 24 h de WhatsApp no cambia, porque la espera es de segundos.
- Mantener el indicador de "escribiendo…" y la idempotencia de las citas
  (`conversationId`) que hoy usa `generateAnswer`.
- Pruebas: varios mensajes en ráfaga → una respuesta; un mensaje durante la
  generación → una segunda respuesta, no dos en paralelo; un mensaje suelto →
  la misma respuesta que hoy, con la espera añadida.
