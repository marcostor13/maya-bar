# HU61 — Aperturas y clics de email · Especificación

Historia: `hu.md` · Fecha: 2026-11-24 · Estado: aprobada

## Objetivo

Saber quién abrió los emails de campaña y en qué enlaces hizo clic, para medir y seguir a los interesados.

## Alcance

- Incluye:
  - Webhook público por empresa `POST /resend/webhook/:tenantId` (cada empresa usa su propia cuenta de Resend) con firma Svix verificada con el "signing secret" guardado cifrado; sin secreto o con firma inválida → 401.
  - Eventos `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`; idempotencia por `svix-id`.
  - Por destinatario: entregado, primera apertura y veces, primer clic, veces, última URL y URLs, rebote (duro/temporal), queja, baja.
  - Rebote duro y queja → lista de no contactar (fuentes `bounce` / `complaint`).
  - Métricas de campaña (apertura, clic, rebote, baja) y lista de quién hizo clic con "Crear oportunidad".
  - Bitácora del contacto (`email_open`, `email_click`) y disparadores HU58 `email_opened` / `email_clicked` (campaña opcional).
  - Configuración → Resend: URL del webhook, secreto, botón para activar el seguimiento en el dominio y último evento recibido; aviso de Apple Mail.
- **Fuera de alcance:** seguimiento de correos enviados por SMTP propio o por el remitente de la plataforma (no pasan por Resend de la empresa).

## Requisitos (EARS)

- **R1** — Cuando llega un webhook firmado de `email.clicked`, el sistema debe marcar al destinatario con el clic y la URL.
- **R2** — Cuando llega un rebote duro o una queja, el sistema debe añadir el correo a la lista de no contactar.
- **R3** — Si la firma no es válida o la empresa no tiene secreto, entonces el evento se rechaza sin cambios.
- **R4** — Si el mismo evento llega dos veces, entonces no se cuenta dos veces.
- **R5** — Cuando un destinatario abre o hace clic por primera vez, el sistema debe registrarlo en la bitácora y avisar a las automatizaciones.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1, R4, R5 | Un `email.clicked` firmado marca clic y URL; repetido no suma; la automatización con disparador de clic se ejecuta | e2e |
| C2 | R2 | Un rebote duro añade el correo a no contactar; uno temporal no | e2e |
| C3 | R3 | Firma inválida o empresa sin secreto → 401 sin cambios | e2e |
