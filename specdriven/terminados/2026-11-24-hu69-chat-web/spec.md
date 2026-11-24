# HU69 — Chat web · spec

## Alcance
- Widget embebible `GET /public/webchat/widget.js` con `data-key` (vanilla JS, Shadow DOM): burbuja, saludo, color y logo de la empresa, formulario opcional de contacto con trampa anti-bots, enlace "Seguir por WhatsApp".
- Canal `web` en conversaciones: el mensaje entra por `ingest` (agente IA, asignación, derivación a humano igual que los demás canales). Las respuestas salen por un hub en memoria hacia el visitante por SSE (`/public/webchat/:key/stream`); al reconectar el widget pide el historial (`/messages?since=`).
- Visitante identificado por un id guardado en localStorage y un token firmado (HMAC); un token alterado da 403. Si deja teléfono o email, se fusiona con el contacto existente (`upsertCustomer`, origen `web`).
- Dominios permitidos por empresa: se valida Origin/Referer en cada endpoint público (403 si no está; 404 si el chat está apagado). CORS abierto para `/public/webchat` (el control lo hace el servicio). Throttling por ruta.
- Configuración en Ajustes → "Chat web" (activo, dominios, título, saludo, color, WhatsApp, agente, pedir datos) con el código para copiar.
- Notas internas (`author: system`) no se muestran al visitante.

## Criterios
- C1: un mensaje desde el widget aparece en la bandeja y la respuesta llega al widget en menos de 2 s (e2e).
- C2: el widget no carga en un dominio que no esté en la lista permitida.

## Fuera de alcance
- Adjuntos desde el visitante; varias instancias del backend (el hub es en memoria: con varias réplicas haría falta Redis pub/sub).
