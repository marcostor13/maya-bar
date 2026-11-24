# HU61 — Aperturas y clics de email

## Historia

**Como** responsable de marketing,
**quiero** saber quién abrió mis emails y en qué enlaces hizo clic,
**para** medir las campañas y seguir a los interesados.

## Contexto (estado actual)

- Las campañas de email salen con Resend desde el worker (`campaigns/campaign-sender.service.ts`). Ya hay estado por destinatario y enlace de baja.
- No se miden aperturas ni clics (no se encontró `opened`).
- El módulo `links` ya acorta enlaces y registra clics.

## Propuesta

1. Activar el seguimiento de aperturas y clics de Resend y recibir sus webhooks (`email.opened`, `email.clicked`, `email.bounced` y `email.complained`) con la firma verificada.
2. Guardar por destinatario: entregado, abierto (primera vez y veces), clic (URL), rebote y queja. Un rebote duro o una queja → lista de no contactar.
3. Métricas de la campaña: tasa de apertura, clic, rebote y baja, y lista de quién hizo clic con "Crear oportunidad".
4. Las aperturas y clics aparecen en la bitácora del contacto y sirven como disparador en HU58.
5. Aviso en la UI: las aperturas son aproximadas por la privacidad de Apple Mail.

## Criterios de aceptación (borrador)

- C1: un webhook `email.clicked` firmado marca al destinatario con el clic y la URL.
- C2: un rebote duro añade el correo a la lista de no contactar.
