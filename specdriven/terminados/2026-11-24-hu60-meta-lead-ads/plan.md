# HU60 — Plan

- `src/lead-ads/`: esquemas `LeadAdForm` (mapeo por formulario) y `LeadAdLead` (bitácora idempotente, `leadgenId` único); `lead-ads-map.ts` puro (respuestas → contacto); `LeadAdsService` (handle, process, retry cron, sync de formularios, reporte); controlador `lead-ads` con `ModuleGuard('leads')` + `MANAGE_ROLES`.
- `messenger-webhook.controller.ts`: firma con `FACEBOOK_APP_SECRET` si existe; `changes` leadgen → `LeadAdsService.handleWebhook`.
- `messenger.service.ts`: `leadgen` en la suscripción con respaldo sin él; `messenger-oauth.service.ts`: `leads_retrieval` y `pages_read_engagement`.
- `customer.schema.ts`: origen `lead_ads`.
- Frontend `settings/lead-ads-settings.ts`: formularios (sincronizar, mapear a pantalla completa, pausa), leads recientes con reintento y reporte por anuncio.
- Docs: `docs/meta-app-review-pendientes.md` con el permiso.
