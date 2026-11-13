# HU10 — El agente IA puede decidir no responder · Especificación

Historia: `backlog/hu10.md` · Fecha: 2026-11-12 · Estado: aprobada

## Objetivo

Que el agente pueda callar a propósito cuando contestar no aporta (publicidad
de terceros, cadenas, un "gracias" o emoji tras despedirse), sin confundirlo
con una respuesta vacía por error, que sigue usando el mensaje de respaldo.

## Usuarios

- Empresa con agentes IA: menos mensajes de relleno a contactos que no son clientes.
- Equipo en la bandeja: ve en el hilo cuándo y por qué el agente no contestó.

## Alcance

- Incluye: marca `{{NO_RESPONDER:motivo}}`, instrucción automática en el prompt
  de sistema, límites de seguridad, nota interna, playground, pruebas.
- **Fuera de alcance:** cambiar el prompt del agente de Sovereign en
  producción antes de desplegar (producción no reconoce la marca y el cliente
  la vería); se deja el texto preparado para aplicarlo tras el deploy.

## Requisitos (EARS)

Funcionales:
- **R1** — Cuando se le permite callar, el prompt de sistema del agente debe
  incluir la instrucción de usar `{{NO_RESPONDER:motivo}}` y en qué casos.
- **R2** — Cuando la respuesta de la IA contiene la marca (y no deriva, ni
  agenda, ni envía archivos o fotos), el sistema no debe enviar nada al
  cliente ni usar el mensaje de respaldo.
- **R3** — Cuando el agente calla, el hilo debe recibir una nota interna
  "El agente IA no respondió: <motivo>".
- **R4** — Si la respuesta de la IA llega vacía sin la marca, entonces se
  envía el mensaje de respaldo, como hoy.
- **R5** — Si deriva a una persona, la derivación gana: se envía su texto o
  `handoffMessage`, aunque aparezca la marca.
- **R6** — El agente no puede callar en el primer mensaje de un contacto
  (sin respuestas previas en el hilo) ni dos veces seguidas: en esos casos no
  se le ofrece la marca y, si la escribe igual, se elimina y se responde como
  hoy (texto o respaldo).
- **R7** — La marca nunca llega al cliente (se elimina siempre).
- **R8** — El indicador "escribiendo…" se apaga aunque no se envíe nada.
- **R9** — En el playground, callar se muestra como anotación ("No
  respondería: motivo"), no como mensaje.

No funcionales:
- **R10** — Funciona igual con todos los proveedores (es texto, no herramienta)
  y en todos los canales.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1, R6 | Dado `allowSilence` true, el system prompt incluye la sección; con false, no | unitaria `generateAnswer` |
| C2 | R2, R7 | Dada una respuesta "{{NO_RESPONDER:promo}}", devuelve `silent` con motivo y `reply` vacío, sin respaldo | unitaria `generateAnswer` |
| C3 | R4 | Dada una respuesta vacía, `reply` = respaldo y `silent` null | unitaria |
| C4 | R5 | Dada "Te paso con alguien {{HANDOFF:x}} {{NO_RESPONDER:y}}", hay derivación y no silencio | unitaria |
| C5 | R6 | Con `allowSilence` false y la marca en la respuesta, se elimina y se usa el texto o el respaldo | unitaria |
| C6 | R2, R3, R8 | `runAgent` con silencio: no llama a enviar, crea la nota interna, apaga "escribiendo…" y marca la conversación | unitaria `runAgent` |
| C7 | R6 | `runAgent` pasa `allowSilence` false si no hay respuestas previas o si el turno anterior fue silencio; tras enviar una respuesta se vuelve a permitir | unitaria |
| C8 | R6, R9 | El playground con silencio devuelve `silent: { reason }` (sin texto ni archivos) y la interfaz lo pinta como anotación "No respondería: motivo"; tras un silencio (turno vacío) no ofrece callar otra vez ni envía el turno vacío a la IA | unitarias `testChat` + `ai-agents.ts` (`tsc`) |
| C9 | — | Prueba real con el agente de Sovereign tras el deploy **[usuario]** | manual |

## Supuestos y decisiones por defecto

- Marca de texto (no herramienta), igual que `{{HANDOFF}}`: Gemini no ejecuta
  herramientas en esta plataforma.
- Si la IA escribe texto además de la marca, se calla (el texto se descarta):
  la marca expresa la decisión.
- Sin excepción "promoción/despedida" al límite: el primer mensaje siempre se
  contesta (la cortesía mínima del prompt v2.1 cubre ese caso).
- Estado "último turno fue silencio": campo `agentSilent` en la conversación.

## Preguntas abiertas

- Ninguna.
