# Lista de no contactar

Quien pide dejar de recibir comunicaciones se marca una vez y deja de entrar en
**todas** las campañas, y el agente IA deja de responderle. Se puede marcar
desde su propia conversación o darlo de alta a mano en `/no-contactar`.

## Por qué es una colección aparte y no un campo del contacto

Es la decisión de diseño que sostiene todo lo demás. Una marca en la ficha del
contacto se pierde en cuanto:

- se vuelve a importar un CSV — `contact-import` hace `bulkWrite` de upserts
  sobre los contactos;
- alguien borra la ficha y la vuelve a crear;
- la misma persona entra otra vez por otro canal y genera un contacto nuevo.

Cualquiera de esas tres cosas haría que se volviera a escribir a quien pidió
que no, que es exactamente lo que esta función existe para impedir. Por eso la
baja vive en su propia colección, **indexada por el dato de contacto
normalizado** (teléfono en dígitos, email en minúsculas), y sobrevive a la
ficha.

La normalización es la misma que usa el CRM (`shared/phone.ts`), así que
`+51 999 888 777`, `999888777` y `51999888777` son la misma persona.

## Dónde se aplica el bloqueo

| Salida | Qué pasa | Dónde |
| --- | --- | --- |
| **Campañas** (WhatsApp y email) | Bloqueo duro, nunca se envía | `CampaignsService.resolveCustomers` |
| **Recuento previo** de la campaña | Descuenta y lo dice en pantalla | `CampaignsService.previewCount` |
| **Agente IA** | Deja de responder automáticamente | `ConversationsService.ingestInbound` |
| **Respuesta manual** | Se permite, con aviso visible en el chat | — |

El filtro de campañas va en `resolveCustomers` **a propósito**: por ahí pasan
las tres formas de segmentar (todos, listas, etiquetas), así que ninguna se lo
puede saltar. Si algún día se añade una cuarta, hereda el bloqueo sola.

La respuesta manual se permite deliberadamente: si alguien escribe y una
persona necesita contestarle, impedirlo sería incorrecto y además se acabaría
sorteando por fuera de la plataforma. Lo que se corta es lo automático.

## Endpoints

| Método | Ruta | Para qué |
| --- | --- | --- |
| `GET` | `/suppression` | Lista (con `?q=` para buscar). |
| `GET` | `/suppression/count` | Cuántos hay. |
| `POST` | `/suppression` | Alta manual. |
| `DELETE` | `/suppression/:id` | Reactivar a alguien. |
| `PATCH` | `/conversations/:id/do-not-contact` | Alta/baja desde el chat. |

Módulo de permisos: `suppression` (etiqueta "No contactar", grupo Clientes).

## Detalles que evitan sorpresas

- **Marcar desde el chat también apaga el agente** de esa conversación: no
  tendría sentido dar de baja a alguien y que el bot le siguiera hablando en
  ese mismo hilo.
- **Repetir el alta no falla**: actualiza la entrada existente en vez de
  chocar contra el índice único.
- **Un contacto sin teléfono ni email nunca se bloquea por error.** Si no hay
  con qué identificarlo, pasa el filtro en lugar de quedar fuera "por si
  acaso" — y dar de baja desde un chat sin ningún dato devuelve un error claro
  pidiendo guardar antes el contacto.
- **El recuento de la campaña resta las bajas.** Si el número de la pantalla no
  fuera el que se envía de verdad, nadie volvería a fiarse de él.
- **Una sola consulta por envío**, no una por destinatario: las bajas del
  tenant se cargan en un conjunto y se filtra en memoria.
