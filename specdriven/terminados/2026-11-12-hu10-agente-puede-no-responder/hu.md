# HU10 — El agente IA puede decidir no responder

## Historia

**Como** empresa que atiende con agentes IA,
**quiero** que el agente pueda quedarse callado cuando responder no aporta nada
(promociones de terceros, cadenas reenviadas, un "gracias" o un emoji después
de despedirse),
**para** no enviar mensajes de relleno ni el texto de respaldo a contactos que
no son clientes.

## Problema observado

- Producción, conversación `6af15dc7b6891cbc64149331` (Sovereign Capital,
  2026-11-09 y 2026-11-11): un contacto mandó dos veces la publicidad de su
  propio evento y luego "Mil gracias 💎". El agente contestó a todo.
- Si la IA devuelve un texto vacío, `ai-agents.service.ts` (≈ líneas 729 y 738)
  lo cambia por `agent.fallbackMessage` ("Lo siento, no tengo esa información en
  este momento"), y `ConversationsService.runAgent` lo envía. Hoy no hay forma
  de que el agente se calle a propósito.
- Arreglo provisional: el prompt v2.1 de ese agente (sección 8.4) pide una
  cortesía mínima ("¡Con gusto! 😊") en lugar de silencio.

## Alcance pedido

1. Un mecanismo explícito para que el agente indique "no responder": una
   herramienta (p. ej. `no_responder(motivo)`) o una marca reservada en la
   respuesta. Debe distinguirse de una respuesta vacía por error, que debe
   seguir usando el mensaje de respaldo.
2. Cuando el agente no responde: no se envía nada al cliente, no se usa el
   mensaje de respaldo, y queda una nota interna en el hilo con el motivo,
   para que el equipo lo vea.
3. La instrucción de uso se añade sola a todos los agentes (como las demás
   instrucciones de sistema), para no depender de que cada prompt la explique.
4. Actualizar el prompt del agente de Sovereign (sección 8.4) para usarla.

## Contexto y supuestos a validar en la spec

- Límite de seguridad: el agente no puede callar el primer mensaje de un
  contacto nuevo, ni dos veces seguidas en la misma conversación, salvo que el
  mensaje sea una promoción o una despedida (criterio a definir).
- Que funcione igual con todos los proveedores de IA (`provider: auto`, Claude,
  OpenAI, DeepSeek, Gemini, Groq) y en todos los canales (WhatsApp, Instagram,
  Messenger, correo).
- El indicador de "escribiendo…" debe apagarse aunque no se envíe nada.
- Pruebas unitarias de `runAgent` y `generateAnswer` para estos casos: no
  responder, respuesta vacía (usa el respaldo) y derivación (sigue enviando
  `handoffMessage`).
