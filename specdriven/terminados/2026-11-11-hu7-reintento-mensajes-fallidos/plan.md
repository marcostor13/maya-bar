# HU7 — Reintento automático de mensajes de WhatsApp fallidos · Plan técnico

## Estado actual

- Los salientes del agente se envían en `conversations.service.ts` (respuesta
  del agente, `msgModel.create` + `deliver`, ~l. 2219) y los manuales en
  `finishDelivery` (~l. 1287). Si `deliver` lanza, queda `failed` con `error`.
- Meta también rechaza después de aceptar: el webhook (`whatsapp-webhook.controller.ts`,
  `cloudError` → `#131042 Título — detalle`) llama a `handleAck`, que pone
  `failed` aunque antes estuviera `sent`.
- Al enviar, `postCloudApiMessage` (`whatsapp/whatsapp.service.ts:315`) lanza
  `CloudAPI 400: <mensaje>` **sin** el código de Meta, así que no se puede
  clasificar.
- No existe ningún reintento de mensajes de la bandeja. Hay patrón de cron con
  reclamo atómico en `inbox-tools.service.ts` (`deliverDue`).
- Mensajes y conversaciones en papelera: `Message.inTrash`, y el esquema de
  conversación oculta la papelera en sus consultas.

## Diseño

- **Datos** (`message.schema.ts`): campos opcionales `retryCount?: number`,
  `retryAt?: Date` (próximo intento; también sirve de candado) y
  `retryStopped?: boolean` (no volver a mirarlo). Índice parcial
  `{ status: 1, at: -1 }` con `partialFilterExpression: { status: 'failed' }`.
  Sin migración: los documentos viejos no tienen los campos y valen como "nunca
  reintentado".
- **Política** (`conversations/message-retry.policy.ts`, funciones puras):
  `isTransientSendError(error)` y `retryDelayMs(retryCount)`.
- **Servicio** (`conversations/message-retry.service.ts`), `@Cron` cada minuto:
  1. Si `WA_AUTO_RETRY === 'false'`, sale.
  2. Candidatos: `status: 'failed'`, `direction: 'out'`, `author ∈ {agent, human}`,
     `inTrash ≠ true`, `retryStopped ≠ true`, `at > ahora − 24 h`, y
     (`retryAt` inexistente y `at ≤ ahora − 2 min`) o `retryAt ≤ ahora`.
     Orden `at` ascendente, máximo 50.
  3. Por candidato: error no temporal → `retryStopped`. Conversación no
     encontrada (papelera), no WhatsApp o bloqueada → `retryStopped`. Hay un
     saliente posterior (cualquier estado) → `retryStopped` (si es fallido, ese
     será el candidato). Último entrante con más de 24 h − 5 min → `retryStopped`.
  4. Cuenta ya fallida en esta pasada → se aplaza (`retryAt` = el que se le dio
     a la otra) sin contar intento.
  5. Reclamo atómico: `findOneAndUpdate({_id, status:'failed', retryAt: <valor leído>}, {$set:{retryAt: ahora+10 min}})`.
     Si devuelve `null`, otra instancia lo tiene.
  6. `ConversationsService.redeliver(conv, msg)` (envoltorio público de
     `deliver`). Éxito → `status: 'sent'`, `externalId`, `$unset error/retryAt`,
     emitir `messageUpdated`. Fallo → `error` nuevo, `retryCount+1`, y
     `retryAt = ahora + retryDelayMs` si sigue siendo temporal; si no,
     `retryStopped`. Emitir `messageUpdated`.
- **Código de Meta en el error** (`whatsapp.service.ts`): `CloudAPI 400 #131042: …`
  leyendo `err.body.error.code`.
- **API / Interfaz:** sin cambios. La bandeja ya actualiza la burbuja con
  `message:updated`.
- **Integraciones:** Cloud API de Meta, mismo envío que hoy.

## Seguridad

Proceso interno sin endpoint: no hay entrada de usuario nueva. Aislamiento por
tenant: el mensaje se reenvía por la conversación y la cuenta a la que ya
pertenece. Respeta bloqueo y papelera. Sin secretos nuevos.

## Observabilidad

Log por pasada con contadores (enviados, aplazados, descartados) y por fallo
con id de mensaje y código; nunca texto ni teléfono.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Reenviar algo ya superado por la conversación | Solo el último saliente; se descarta si hay uno posterior |
| Doble envío con varias instancias | Reclamo atómico por `retryAt` |
| Bucle contra Meta mientras la cuenta sigue rota | Espera creciente + una sola sonda por cuenta y pasada; tope natural de 24 h |
| Algo inesperado en producción | `WA_AUTO_RETRY=false` lo apaga |

## Estrategia de pruebas

- Unitarias: política (clasificación y esperas), servicio con modelos simulados
  (C3–C12), `whatsapp.service` (C13).
- e2e: no aplica — el comportamiento depende de un rechazo de Meta que el stub
  no simula; el servicio se prueba con modelos simulados.
- Manual: C15 **[usuario]**.

## Fases

1. Código de Meta en el error + política + servicio + índice (una sola entrega
   desplegable, apagable por variable).

## ADRs

- No aplica: no hay decisión difícil de revertir (sin proveedor ni modelo nuevo).
