# HU60 — Meta Lead Ads → contactos · Especificación

Historia: `backlog/hu60-meta-lead-ads.md` · Fecha: 2026-11-24 · Estado: aprobada

## Objetivo

Que cada formulario de anuncio de Facebook/Instagram llegue al instante como contacto y oportunidad en Maya, sin descargar CSV.

## Usuarios

- Dueño o jefe (TENANT_ADMIN / MANAGER): conecta la Página (ya existe, Messenger), revisa formularios, mapea preguntas y ve el reporte por anuncio.
- Vendedor: recibe la oportunidad repartida (HU59).

## Alcance

- Incluye:
  - Suscripción de la Página al campo `leadgen` (con respaldo: si Meta lo rechaza, se mantiene la suscripción de mensajes) y permiso `leads_retrieval` en el login de Páginas.
  - Webhook de Página (`/messenger/webhook`) procesa `changes[].field = leadgen` de todas las entradas; firma `X-Hub-Signature-256` con `FACEBOOK_APP_SECRET` cuando está configurado.
  - Lectura del lead por Graph API (`/{leadgen_id}`) con el token de la Página: respuestas, anuncio, conjunto, campaña y formulario.
  - Contacto creado o actualizado deduplicando por teléfono o email; origen `lead_ads`; respuestas no mapeadas en `customFields`; `adReferral` con el anuncio.
  - Oportunidad en la etapa inicial sin responsable (la reparte HU59) y eventos `contact_created`/`lead_created` (HU58/HU59).
  - Mapeo por formulario de pregunta → nombre / email / teléfono / campo personalizado / ignorar; opción de no crear oportunidad; pausa por formulario.
  - Idempotencia por `leadgen_id` (índice único). Reintento de los que fallaron al leer de Meta (cron cada 10 min, hasta 5 intentos, y botón manual).
  - Reporte por anuncio: leads y oportunidades ganadas, de Lead Ads y de click-to-WhatsApp (por `adReferral.adId`).
  - Pantalla en Configuración (TENANT_ADMIN/MANAGER).
- **Fuera de alcance:** la App Review de Meta (**[usuario]**), sincronizar leads antiguos, CAPI de vuelta a Meta.

## Requisitos (EARS)

- **R1** — Cuando llega un evento `leadgen` de una Página conectada y activa, el sistema debe leer el lead en Graph API y crear o actualizar el contacto con sus respuestas y el origen del anuncio.
- **R2** — Si el mismo `leadgen_id` llega otra vez, entonces no debe duplicar contacto ni oportunidad.
- **R3** — Cuando el contacto ya existe (mismo teléfono o email), el sistema debe actualizarlo (sin pisar datos existentes) en vez de crear otro.
- **R4** — Cuando el formulario permite crear oportunidad, el sistema debe crearla en la etapa inicial sin responsable y avisar a reparto y automatizaciones.
- **R5** — Si la firma no es válida (con secreto configurado), entonces el evento se descarta.
- **R6** — Si falla la lectura en Meta, entonces el lead queda "fallido" con el error y se reintenta.
- **R7** — Multitenant: la Página determina el tenant; la configuración solo la ven TENANT_ADMIN/MANAGER de esa empresa.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1, R4 | Un webhook `leadgen` simulado crea el contacto con sus respuestas, el origen del anuncio y la oportunidad | e2e con Graph API simulada |
| C2 | R2, R3 | El mismo lead recibido dos veces no duplica; otro lead del mismo teléfono actualiza el contacto | e2e |
| C3 | R5, R6 | Firma inválida se descarta; fallo de Graph queda fallido y el reintento lo procesa | e2e |

## Supuestos

- La Página ya está conectada por Messenger (OAuth existente); el mismo token de Página sirve si se concedió `leads_retrieval`.

## Preguntas abiertas

- ninguna
