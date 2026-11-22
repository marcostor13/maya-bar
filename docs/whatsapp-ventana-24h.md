# Volver a contactar en WhatsApp pasadas 24 h

WhatsApp Cloud API solo deja escribir texto libre durante **24 h desde el último
mensaje del cliente**. Pasado ese plazo, Meta solo acepta **plantillas aprobadas**.
Cuando el cliente responde a la plantilla, la ventana se abre otras 24 h.

## En Conversaciones

- Encima del cuadro de texto se ve cuánto queda de ventana ("Puedes escribir
  libremente 3 h más"); en naranja cuando faltan menos de 2 h.
- Con la ventana cerrada, el cuadro de texto se sustituye por **Enviar plantilla**.
- En el selector eliges la plantilla, rellenas las variables (`{{1}}` se propone
  con el nombre del contacto), ves la vista previa y envías.
- También puedes enviar una plantilla con la ventana abierta (enlace "Enviar plantilla").
- El agente IA no responde con la ventana cerrada.
- Solo aplica a números conectados por **WhatsApp Cloud API**. Los conectados por
  QR no tienen esta regla.

## Plantillas recomendadas (créalas en Plantillas de WhatsApp)

Prefiere la categoría **Utilidad** cuando el mensaje sigue una consulta del
cliente: es más barata que Marketing. Añade botones de respuesta rápida: tocar
uno cuenta como respuesta y reabre la ventana.

1. **seguimiento_consulta** · Utilidad · es
   > Hola {{1}}, te escribimos de {{2}} para dar seguimiento a tu consulta. ¿Sigues interesado?
   Botones: "Sí, sigamos" · "Ahora no"
2. **reactivacion** · Marketing · es
   > Hola {{1}} 👋 Hace un tiempo hablamos sobre {{2}}. Tenemos novedades que pueden interesarte. ¿Te cuento?
   Botones: "Sí, cuéntame" · "No, gracias"

Meta las revisa (normalmente en minutos). Solo las **aprobadas** aparecen en el chat.

## Otras vías

- **Anuncios Click-to-WhatsApp**: quien entra desde un anuncio abre una ventana
  de 72 h gratis (la bandeja la cuenta como 24 h, por prudencia).
- **Correo o SMS**: si el contacto los tiene, puedes seguir por ese canal.
- **Messenger e Instagram** permiten responder hasta 7 días con la etiqueta
  "agente humano", pero requieren un permiso aprobado por Meta (no incluido aún).
