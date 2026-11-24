# Cierre HU60 — Meta Lead Ads → contactos

## Qué quedó
- Backend `src/lead-ads/`: `lead_ad_forms` (formularios con preguntas, mapeo, crear oportunidad, pausa, contador) y `lead_ad_leads` (bitácora idempotente por `leadgenId` único, estado, intentos, anuncio/conjunto/campaña, candado).
- El webhook de Página `/messenger/webhook` procesa todos los `changes` con `field = leadgen`; con `FACEBOOK_APP_SECRET` exige firma `X-Hub-Signature-256` válida (los mensajes de Messenger siguen como antes).
- Lectura del lead en Graph API con el token de la Página; contacto nuevo (`source: lead_ads`, `adReferral` con el anuncio, respuestas en `customFields`) o actualizado sin pisar datos (dedupe por teléfono o email); oportunidad en la etapa inicial sin responsable con aviso al equipo; eventos `contact_created` y `lead_created` (automatizaciones HU58 y reparto HU59).
- Alta automática del formulario con el primer lead; sincronizar formularios de todas las Páginas; reintento manual y cron cada 10 min (5 intentos, 7 días).
- Reporte por anuncio: contactos de Lead Ads y de click-to-WhatsApp, oportunidades y ganadas.
- Suscripción de la Página con `leadgen` y respaldo sin él; login de Páginas pide `leads_retrieval` y `pages_read_engagement`.
- Frontend: sección "Meta Lead Ads" en Configuración (TENANT_ADMIN/MANAGER) con formularios, mapeo a pantalla completa, últimos leads con reintento y resultados por anuncio; etiqueta "Lead Ads" en Contactos.
- Docs: `docs/meta-app-review-pendientes.md` §2d.

## Verificación
- spec-verifier: no se pudo lanzar (el hook de context-mode cambia la llamada y el modo automático la rechaza). Autoverificación:
  - C1 CUMPLE — `test/lead-ads.e2e-spec.ts` C1: webhook firmado → contacto con respuestas, `adReferral`, oportunidad sin responsable, reporte y contador.
  - C2 CUMPLE — e2e C2: mismo `leadgen_id` no duplica; otro lead del mismo teléfono completa el contacto sin pisar el nombre.
  - C3 CUMPLE — e2e C3: firma inválida descartada; Graph caído → fallido, reintento manual y cron lo procesan.
  - R7 — e2e: vendedor 403, otra empresa no ve ni edita (404).
- Pruebas: `lead-ads-map.spec.ts` (3), `messenger.service.spec.ts` (+1), e2e propia (4), `platform.e2e-spec.ts` (19), `lead-ads-settings.spec.ts` (3). Builds OK.

## Pendiente
- **[usuario]** App Review de `leads_retrieval`/`pages_read_engagement`, suscribir `leadgen` en el panel de la app, `FACEBOOK_APP_SECRET` en producción y reconectar las Páginas (ver §2d).
- Si dos empresas conectan la misma Página, los leads van a la primera que la conectó.
