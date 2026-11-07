# HU2 — Origen de campaña · Plan técnico

## Estado actual

- `backend/src/shared/ad-referral.ts` + `conversations.service.ts` (upsert de
  conversación): guarda `adReferral` del primer mensaje Click-to-WhatsApp.
- Campañas (`backend/src/campaigns`): WhatsApp se envía en línea sin filas de
  destinatario (`campaigns.service.ts` `send`); correo/SMS por
  `CampaignRecipient` y `campaign-sender.service.ts`.
- Recuperación (`backend/src/recovery`): `recovery-analysis.service.ts` `run`
  toma las conversaciones de WhatsApp de los últimos N días.
- Bandeja: `listConversations` con filtros por canal, estado, asignación…;
  frontend `inbox.ts` + `inbox-filters.ts`.

## Diseño

- **Datos**
  - `Conversation.campaign?: { kind: 'ad'|'campaign', id: string, name: string, at: Date }`
    con índice `{tenantId, 'campaign.kind', 'campaign.id'}`.
  - Nueva colección `campaign_touches` (`CampaignTouch`): tenantId, campaignId,
    campaignName, channel (`phone`|`email`), address (normalizada: últimos 9
    dígitos o email en minúsculas), at. Índice `{tenantId, channel, address, at:-1}`,
    TTL 90 días.
- **Módulo `campaign-attribution`** (sin dependencias de otros módulos):
  `CampaignAttributionService.recordTouches(...)`, `.lookup(tenantId, convChannel, contact)`,
  helpers puros `touchAddress`, `parseCampaignFilter`, `campaignFromReferral`.
- **Escrituras**: `campaigns.service.send` (WhatsApp, por cada envío
  cumplido) y `campaign-sender` (correo/SMS al marcar `sent`).
- **Lectura**: upsert de conversación → si no tiene `campaign`: anuncio →
  `ad`; si no, `lookup` de toques ≤ 30 días.
- **API**: `GET /conversations/campaigns?channel=` (agregación) y filtro
  `campaign=<kind>:<id>` en `GET /conversations`.
- **Recuperación**: `CreateRecoveryPlanDto.campaign?` → `plan.campaign`
  (`{kind,id,name}`); `run` añade el filtro.
- **Arranque**: `ConversationsService.onModuleInit` marca con pipeline
  `updateMany` las conversaciones con `adReferral.adId` sin `campaign`.
- **Interfaz**: etiqueta de campaña en la lista y chip en la cabecera; select
  "Campaña" en filtros; select de campaña en el paso 1 del asistente de
  recuperación.

## Seguridad

`tenantId` del JWT en todas las consultas; el filtro se parsea con expresión
regular estricta; `ObjectId` validado.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Teléfonos en formatos distintos | comparación por los últimos 9 dígitos |
| Volumen de toques | TTL 90 días + índice compuesto; inserción en lote |
| Fallo al registrar toques no debe romper el envío | try/catch con log |

## Pruebas

Unitarias de helpers y servicio de atribución, upsert de conversación,
filtro de listado, agregación, envío de campaña, análisis de recuperación;
suites completas y builds.
