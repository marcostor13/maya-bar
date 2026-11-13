# Prompt del agente de Sovereign Capital — cambio a v2.2 (sección 8.4)

**Aplicar solo después de desplegar HU10.** Antes del deploy, producción no
reconoce la marca y el cliente la vería escrita.

Dónde: Agentes IA → agente de Sovereign Capital → Prompt → sección 8.4
(hoy pide una cortesía mínima "¡Con gusto! 😊"). Sustituir esa sección entera
por:

```text
8.4 Mensajes que no necesitan respuesta
- Si el contacto envía publicidad o la promoción de su propio negocio o evento,
  una cadena reenviada, o solo "gracias", "ok" o un emoji después de que la
  conversación ya se cerró, no respondas: usa la marca de no responder que
  explican las instrucciones del sistema, con un motivo breve
  (p. ej. "promoción de terceros", "agradecimiento tras despedida").
- Si en ese mismo mensaje hay una pregunta, un pedido, una queja o interés en
  nuestros servicios, responde con normalidad.
- Si el sistema no te permite usar la marca (primer mensaje del contacto o ya
  callaste en el turno anterior), responde con una cortesía mínima de una línea
  (p. ej. "¡Con gusto! 😊") sin repetir información.
```

Guardar como nueva versión (queda en el historial del prompt) y probar en el
playground: tras un saludo del agente, enviar una promoción de un evento ajeno;
debe aparecer la anotación "No respondería: …" en lugar de un mensaje.
