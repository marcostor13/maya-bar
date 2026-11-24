# Integración con Zapier y Make (HU65)

## Para el cliente
1. En Maya: **Integraciones → Nuevo acceso → Uso de la clave: Automatización**. Elige la cuenta de WhatsApp (la usa la acción "Enviar plantilla"). Copia la clave: solo se muestra una vez.
2. En Zapier o Make, busca **Maya CRM**, conecta y pega la clave.

La clave de automatización no pide dominio (Zapier y Make llaman desde sus servidores). Si quieres, limita las IPs en la misma pantalla.

## API
- Base: `https://api.mayacrm.site/api/v1` · `Authorization: Bearer <clave>`
- Especificación: `GET /api/v1/openapi.json` (OpenAPI 3.0, pública).
- Contactos: `GET /contacts?email=&phone=&since=&limit=`, `GET /contacts/:id`, `POST /contacts` (crea o actualiza por email y luego teléfono), `PATCH /contacts/:id`, `POST /contacts/:id/tags`.
- Oportunidades: `GET /leads?since=`, `POST /leads` (`contactId` o `contact`).
- WhatsApp: `POST /whatsapp/templates` (`to` o `contactId` + `template`), admite `Idempotency-Key`.
- Las escrituras cuentan contra los límites por minuto y por día de la clave (429 + `Retry-After`).

## Disparadores (REST hooks)
`POST /hooks { event, targetUrl }` → `{ id }`; `DELETE /hooks/:id`; `GET /hooks/samples/:event` devuelve un ejemplo.

Eventos: `contact.created`, `form.submitted`, `lead.stage_changed`, `message.received`, `event.registered`.

Carga: `{ id, event, occurredAt, data }`. Cabeceras `X-Maya-Event`, `X-Maya-Timestamp` y `X-Maya-Signature` = `sha256=` + HMAC-SHA256(sha256hex(clave), `<timestamp>.<cuerpo>`).
- Si el receptor responde **410**, la suscripción se borra.
- Hay 3 intentos (0 s, 5 s y 30 s). Tras 20 fallos seguidos la suscripción se desactiva.
- Si la clave se revoca, sus suscripciones dejan de enviarse.

## Publicar (lo hace el dueño de la plataforma)
- **Zapier** (`integrations/zapier/`):
  1. `npm i -g zapier-platform-cli`
  2. `npm i`
  3. `zapier login`
  4. `zapier register "Maya CRM"`
  5. `zapier push`

  Para otra URL: `zapier env:set 1.0.0 MAYA_API_URL=https://…`. La app queda privada; se invita a los clientes con `zapier users:add`. Hacerla pública requiere la revisión de Zapier.
- **Make** (`integrations/make/maya-crm.make.json`): en *My apps → Create app*, pega cada bloque en su pestaña: Base, Connection, Webhooks y Modules. Comparte la app por enlace de invitación; publicarla requiere la revisión de Make.
