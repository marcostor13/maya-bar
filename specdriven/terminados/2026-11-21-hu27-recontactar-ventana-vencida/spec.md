# HU27 — Volver a contactar cuando venció la ventana de 24 h · Especificación

Historia: `backlog/hu27-recontactar-ventana-vencida.md` · Fecha: 2026-11-21 · Estado: aprobada

## Objetivo

En WhatsApp Cloud API solo se puede escribir texto libre durante 24 h desde el
último mensaje del cliente. Hoy la bandeja no lo sabe: el operador escribe, Meta
rechaza (#131047) y el mensaje queda fallido sin explicación. Esta historia hace
visible la ventana y permite reabrir la conversación con una plantilla aprobada
desde el mismo chat.

## Usuarios

- Operador/vendedor (roles CRM): ver si puede escribir y reabrir el chat con una plantilla.

## Alcance

- Incluye: estado de la ventana por chat (WhatsApp Cloud API), envío de plantilla
  aprobada desde el chat (variables de cuerpo y de cabecera de texto, cabecera
  multimedia con el archivo de ejemplo guardado), bloqueo en el backend del texto
  libre fuera de ventana (bandeja, reintento manual, programados), el agente IA no
  envía fuera de ventana, reintento correcto de un mensaje de plantilla.
- **Fuera de alcance:** Messenger/Instagram (etiqueta HUMAN_AGENT, 7 días),
  cuentas de WhatsApp por QR (no tienen ventana), crear plantillas desde el chat
  (ya existe en Plantillas), botones dinámicos con variables de URL, ventana de
  72 h de anuncios Click-to-WhatsApp (se trata como 24 h; conservador).

## Requisitos (EARS)

Funcionales:
- **R1** — Cuando el operador abre un chat de WhatsApp Cloud API, el sistema debe
  indicar si la ventana está abierta y cuánto le queda, o que está cerrada.
- **R2** — Cuando la ventana está cerrada, el compositor debe sustituirse por un
  aviso con la acción "Enviar plantilla".
- **R3** — Cuando el operador elige una plantilla APROBADA de la cuenta del chat,
  rellena sus variables y la envía, el sistema debe guardarla en el chat (texto
  ya renderizado, marcada como plantilla) y entregarla con la API de plantillas de Meta.
- **R4** — Si falta una variable, la plantilla no existe en la cuenta del chat o
  no está aprobada, entonces el sistema debe rechazar el envío con un mensaje claro.
- **R5** — Si se intenta enviar texto libre (bandeja, reintento manual o mensaje
  programado) a un chat de Cloud API con la ventana cerrada, entonces el backend
  debe rechazarlo con un mensaje claro sin llamar a Meta.
- **R6** — Cuando el cliente responde, la ventana debe reabrirse en la interfaz
  sin recargar (por el mensaje entrante del socket).
- **R7** — Si el agente IA fuera a responder con la ventana cerrada, entonces el
  sistema no debe enviar y debe registrarlo en el log.
- **R8** — Cuando se reintenta (manual o automático) un mensaje de plantilla, el
  sistema debe reenviarlo como plantilla, no como texto libre.

No funcionales:
- **R9** — Seguridad: todo filtrado por `tenantId` del JWT; solo plantillas de la
  cuenta del chat; mismos roles que enviar un mensaje (CRM_ROLES); solo escribe
  quien atiende el chat (asignación existente); bloqueados no.
- **R10** — Accesibilidad: el selector es un modal con `role="dialog"`, cierra con
  Esc, campos con etiqueta.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | Dado un chat Cloud API con último entrante hace 3 h, cuando se pide su ventana, entonces `applies=true, open=true, expiresAt=entrante+24h`; con entrante hace 25 h `open=false`; en QR/Instagram/correo `applies=false` | unitaria backend |
| C2 | R1, R2, R6 | Dado `open=false`, la bandeja muestra el aviso y el botón "Enviar plantilla" en lugar del compositor; al llegar un entrante, vuelve el compositor | unitaria frontend (cálculo) + revisión de plantilla |
| C3 | R3 | Dado una plantilla aprobada con {{1}}, cuando se envía con `["Ana"]`, entonces se guarda un mensaje con el texto renderizado y `template.name`, y se llama a `sendCloudApiTemplate` con nombre, idioma y variables | unitaria + e2e API |
| C4 | R4 | Sin variables, con plantilla de otra cuenta o no aprobada → 422 sin llamar a Meta | unitaria + e2e API |
| C5 | R5 | Texto libre con ventana cerrada en Cloud API → 409 "ventana de 24 h cerrada…", sin mensaje guardado ni llamada a Meta; el reintento manual de un fallido igual | unitaria + e2e API |
| C6 | R7 | Con ventana cerrada, `sendFromAgent` no llama a Meta | unitaria |
| C7 | R8 | Reintentar un mensaje de plantilla fallido llama a `sendCloudApiTemplate`, no a `sendMessage` | unitaria |
| C8 | R9 | Otro tenant → 404; rol sin permiso → 403 | e2e API |
| C9 | R3 | En producción, reabrir un chat vencido con una plantilla real **[usuario]** | manual |

## Supuestos y decisiones por defecto

- Ventana = 24 h desde el último mensaje entrante (`direction: 'in'`) del chat.
- Solo aplica a `channel=whatsapp` con cuenta `provider='cloudapi'`.
- Plantilla con cabecera multimedia: se usa el `headerMediaUrl` guardado en la
  plantilla; si no lo hay, no se ofrece (no se puede enviar).
- El mensaje automático tras una llamada perdida (HU6) no pasa por la
  comprobación: la llamada del cliente abre la ventana en Meta aunque no deje
  un mensaje entrante en el chat.
- Las de AUTENTICACIÓN no se ofrecen (requieren código y botón de copia).
- La plantilla puede enviarse también con la ventana abierta (útil para un
  recordatorio formal); se ofrece siempre desde el menú, pero se destaca al cerrar.

## Preguntas abiertas

- Ninguna.
