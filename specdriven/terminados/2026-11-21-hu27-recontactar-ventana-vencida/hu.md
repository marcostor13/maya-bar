# HU27 — Volver a contactar cuando venció la ventana de 24 h

## Historia

**Como** operador que atiende en Conversaciones,
**quiero** saber cuándo vence la ventana de 24 h de un chat y, si ya venció,
poder reabrirlo con una plantilla aprobada de Meta desde el mismo chat,
**para** no perder al cliente ni que mis mensajes fallen sin explicación.

## Contexto (estado actual)

- La API de integraciones (HU13) ya calcula la ventana (`windowOpen` en
  `api-messages.service.ts`, último mensaje entrante < 24 h) y envía plantillas
  con `wa.sendCloudApiTemplate`.
- La bandeja **no** sabe de la ventana: un mensaje libre fuera de ella sale y
  Meta lo rechaza (#131047); HU7 lo marca fallido sin reintento. El operador no
  tiene forma de mandar una plantilla desde el chat.
- Las plantillas se sincronizan de Meta por cuenta (`whatsapp-templates`, con
  estado, categoría, idioma y variables).

## Estrategia

1. **Ver la ventana**: en el chat de WhatsApp (Cloud API), un aviso con el tiempo
   restante ("La ventana cierra en 3 h") y, vencida, el compositor cambia a
   "Ventana cerrada: envía una plantilla para reabrir la conversación".
2. **Enviar plantilla desde el chat**: selector de plantillas APROBADAS de la
   cuenta del chat, con relleno de variables (sugerencia automática: nombre del
   contacto en {{1}}) y vista previa. Se guarda como mensaje del chat y se
   entrega con `sendCloudApiTemplate`.
3. **Reabrir al responder**: cuando el cliente contesta, la ventana vuelve a
   abrirse 24 h y el compositor normal reaparece. Conviene preferir plantillas
   UTILITY (más baratas) frente a MARKETING cuando el motivo lo permita.
4. **Bloquear el error evitable**: el backend rechaza (409 con mensaje claro) el
   texto libre fuera de ventana en WhatsApp Cloud API, en vez de enviarlo para que
   Meta lo rechace.
5. **Agente IA y programados**: el agente no intenta responder fuera de ventana;
   un mensaje programado que vence fuera de ventana queda fallido con el motivo.
6. **Plantillas sugeridas** (documentación al usuario, no código): una UTILITY de
   "seguimiento de tu consulta" y una MARKETING de "reactivación", con botones de
   respuesta rápida ("Sí, me interesa" / "Ahora no") para facilitar que contesten
   y se reabra la ventana.

## Otras opciones consideradas

- **Messenger / Instagram**: la etiqueta `HUMAN_AGENT` permite responder hasta
  7 días tras el último mensaje del cliente (requiere el permiso aprobado en App
  Review). Fuera de alcance; historia aparte.
- **Otros canales del mismo contacto**: si tiene correo o SMS, ofrecer continuar
  por ahí (ya existen). Solo un enlace en el aviso, sin lógica nueva.
- **Click-to-WhatsApp ads**: el clic abre una ventana de 72 h gratis. Ya lo
  marca Meta; no requiere código.
- **WhatsApp por QR (no oficial)**: no tiene ventana, pero no se recomienda por
  riesgo de bloqueo del número.

## Supuestos

- Solo aplica a cuentas de WhatsApp Cloud API (las de QR no tienen ventana).
- La ventana se cuenta desde el último mensaje entrante del contacto.
- Cada plantilla enviada tiene costo según la tarifa de Meta (HU18 ya lo registra).

## Criterios de aceptación (borrador)

- C1: el chat de Cloud API muestra el tiempo restante o "ventana cerrada".
- C2: con la ventana cerrada, el operador elige una plantilla aprobada, rellena
  variables, ve la vista previa y la envía; aparece en el chat con su estado.
- C3: el backend rechaza texto libre fuera de ventana con un mensaje claro.
- C4: al responder el cliente, el compositor normal vuelve sin recargar.
- C5: el agente IA no envía fuera de ventana.
- C6: todo filtrado por tenant; solo plantillas de la cuenta del chat.
