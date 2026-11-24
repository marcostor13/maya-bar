# HU60 — Meta Lead Ads → contactos

## Historia

**Como** inmobiliaria o academia que anuncia en Facebook e Instagram,
**quiero** que cada formulario de anuncio llegue al instante como contacto y oportunidad en Maya,
**para** llamar en minutos y no descargar CSV.

## Contexto (estado actual)

- No hay integración con Lead Ads (no se encontró `leadgen`).
- Ya hay OAuth con Meta para Messenger e Instagram (`messenger-accounts`, `instagram-accounts`) con páginas conectadas, y webhooks de Meta.
- Ya se guarda la atribución click-to-WhatsApp (`ctwa_clid`, HU2).

## Propuesta

1. Pedir el permiso `leads_retrieval` y suscribir la página al campo `leadgen` del webhook.
2. Con cada lead:
   - Leer las respuestas por Graph API y crear o actualizar el contacto, deduplicando por teléfono o email.
   - Guardar el origen: campaña, conjunto, anuncio y formulario.
   - Crear la oportunidad en la etapa inicial y repartirla (HU59).
   - Disparar automatizaciones (HU58).
3. Mapeo de preguntas del formulario de Meta a los campos de Maya (por formulario).
4. Reporte de leads y oportunidades ganadas por anuncio, junto a los de click-to-WhatsApp.
5. **[usuario]** Pedir el permiso en App Review de Meta (ver `docs/meta-app-review-pendientes.md`).

## Criterios de aceptación (borrador)

- C1: un webhook `leadgen` simulado crea el contacto con sus respuestas y el origen del anuncio (e2e con Graph API simulada).
- C2: el mismo lead recibido dos veces no duplica el contacto.
