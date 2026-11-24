# Cierre HU61 — Aperturas y clics de email

## Qué quedó
- Webhook por empresa `POST /resend/webhook/:tenantId` con firma Svix (secreto `whsec_…` cifrado por empresa); 401 sin secreto o con firma inválida; idempotencia por `svix-id` (`email_events`, TTL 30 días).
- Por destinatario: entregado, aperturas (primera y veces), clics (primero, veces, última URL y lista), rebote duro/temporal, queja y baja (la baja desde el enlace marca el último envío de esa dirección).
- Rebote duro y queja → no contactar (`bounce` / `complaint`), también si el correo no es de una campaña.
- `GET /campaigns/:id/email-metrics`: tasas y quién hizo clic; en el detalle de campaña con "Crear oportunidad" y marcas por destinatario; aviso de Apple Mail.
- Bitácora del contacto (`email_open`, `email_click`) y disparadores de automatización "Abre un email" / "Hace clic" con campaña opcional.
- Configuración → Resend: URL del webhook, secreto, "Activar aperturas y clics" (actualiza el dominio en Resend) y último evento recibido.

## Verificación
- spec-verifier: no se pudo lanzar (el hook de context-mode cambia la llamada y el modo automático la rechaza). Autoverificación:
  - C1 CUMPLE — `test/email-tracking.e2e-spec.ts` C1: clic firmado → clics 1, URL, apertura implícita, actividad, evento repetido no suma, automatización etiqueta al contacto, métricas.
  - C2 CUMPLE — e2e C2: rebote duro → no contactar `bounce`; temporal no; queja → `complaint`.
  - C3 CUMPLE — e2e C3: otra clave o empresa sin secreto → 401 y sin cambios; aperturas suman; baja en métricas; otra empresa 404.
- Pruebas: `svix-signature.spec.ts` (2), e2e propia (3), unitarias relacionadas 191, e2e relacionadas 20, `campaign-recipients.spec.ts` (3), `automations.spec.ts` ajustado.

## Pendiente
- **[usuario]** En cada cuenta de Resend: crear el webhook con la URL que muestra Configuración, pegar el secreto y pulsar "Activar aperturas y clics".
- Los correos enviados por SMTP propio o por el remitente de la plataforma no se miden.
