# Conversiones: Maya CRM avisa a Ignia

Cómo se atribuye una venta al anuncio que la trajo, sin romper el chat.

## El problema

Un número de WhatsApp Cloud API pertenece a una WABA, y sus mensajes se
entregan a las **apps de Meta suscritas a esa WABA**. El 991 172 822 está en la
app "Maya IA Prod", cuyo webhook apunta a `api.mayacrm.site`. Hay una sola URL
por app (el `override_callback_uri` por número tampoco admite dos): **si se
apunta el webhook a otro sitio, Maya CRM deja de recibir los chats y el agente
se queda mudo.**

Así que Maya no cede el webhook: lo mantiene y **avisa** a Ignia cuando pasa
algo que vale dinero.

```
Anuncio → WhatsApp → webhook → Maya CRM ──(chat, agente IA, embudo)
                                   │
                                   └─ POST CONVERSIONS_URL  (lead / cita / venta)
```

## 1. Captura de la atribución

Meta manda el anuncio de origen en `messages[0].referral`, y **solo en el
primer mensaje** que el cliente escribe tras pulsar el anuncio. De ahí salen:

| Campo de Meta | Se guarda como | Para qué |
| --- | --- | --- |
| `ctwa_clid` | `ctwaClid` | **Lo imprescindible**: es lo que casa la conversión con la campaña |
| `source_id` | `adId` | Id del anuncio o de la publicación |
| `source_type` | `sourceType` | `ad` o `post` |
| `source_url`, `headline`, `body` | igual | Reconocer el anuncio sin abrir Meta |

Se graba en la conversación (`conversations.adReferral`) con **atribución de
primer toque**: si el chat ya venía de un anuncio, un clic posterior en otro no
se la quita al que trajo al cliente. Cuando el chat se guarda como contacto, la
atribución viaja con él a `customers.adReferral`, porque las conversiones
cuelgan del contacto y no del chat.

Si no se captura en ese instante, se pierde para siempre.

## 2. Cuándo se avisa

| Hecho de negocio | Evento que se manda |
| --- | --- |
| Oportunidad movida a **Calificado** | `lead` |
| Reserva creada | `schedule` |
| Oportunidad movida a **Ganado** | `purchase` (con `value` y `currency`) |

Los pedidos de mesa no disparan nada: no llevan contacto ni teléfono, así que
no hay forma de atribuirlos. Un cobro que ocurre fuera del embudo se reporta a
mano (ver 4).

Cada hecho se reporta **una sola vez**: un índice único por
`(tenant, evento, tipo, id)` evita que sacar y volver a meter una oportunidad en
"Calificado" cuente dos veces.

## 3. Cómo se resuelve de qué anuncio salió

Por orden, hasta encontrarlo:

1. `adReferral` de la ficha del contacto.
2. Conversación de ese contacto que tenga `ctwa_clid`.
3. Conversación de WhatsApp cuyo número coincida (normalizado a dígitos) — es
   el caso de una reserva pública, que solo deja un teléfono.

**Sin `ctwa_clid` no se manda nada**: Meta no podría atribuirlo y sería ruido.

## 4. El contrato

`POST $CONVERSIONS_URL`, con `Authorization: Bearer $CONVERSIONS_TOKEN` si hay
token:

```json
{
  "event": "purchase",
  "event_id": "66f0c3e8a1b2c3d4e5f60718",
  "event_time": "2026-09-22T15:04:05.000Z",
  "ctwa_clid": "ARAbc123...",
  "ad_id": "120210000000000",
  "source_url": "https://fb.me/anuncio",
  "contact": { "name": "Ana", "phone": "+51 991 172 822", "email": "ana@correo.com" },
  "value": 1200,
  "currency": "PEN",
  "notes": "Aula virtual — plan anual",
  "tenant_id": "66e0...",
  "reference": { "type": "lead", "id": "66ef..." }
}
```

`event_id` es estable por evento: si un reintento llega después de que el
primero sí entró, Ignia puede descartarlo por ese id.

> Este cuerpo es el acordado por defecto. Si la sección 6 del documento de
> Ignia define otro nombre de campo, se cambia en `payload()` de
> `backend/src/conversions/conversions.service.ts` — es el único sitio.

### Reportar a mano

Para un cobro que no pasa por el embudo, desde la plataforma (rol con acceso a
Oportunidades):

```bash
curl -X POST https://api.mayacrm.site/conversions \
  -H "Authorization: Bearer <jwt de la sesión>" \
  -H "Content-Type: application/json" \
  -d '{"event":"purchase","phone":"991172822","value":1200,"currency":"PEN","notes":"Pago por Yape"}'
```

Maya resuelve la atribución por ese teléfono y manda el evento. `GET
/conversions` lista los últimos con su estado, para ver qué llegó y qué falló.

## 5. Si Ignia está caída

El evento se guarda en Mongo **antes** de salir a la red y se reintenta con
espera creciente: 1, 2, 4, 8, 16 y 32 minutos. A los seis intentos queda en
`failed` y se registra en el log. Mientras tanto nada del negocio se bloquea:
cobrar, reservar y mover el embudo no esperan la respuesta de Ignia.

Con dos instancias levantadas solo una se lleva cada evento: el reintento
reserva el turno en la base antes de llamar.

## 6. Puesta en marcha

1. `CONVERSIONS_URL` y `CONVERSIONS_TOKEN` en el entorno del backend.
2. Nada más. El webhook de WhatsApp **no se toca**.

Ojo: la atribución solo existe para los chats que entren **desde ahora**. Los
anteriores no traen `ctwa_clid` y no se pueden recuperar.
