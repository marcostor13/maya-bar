# HU18 — Costos de los mensajes en el dashboard · Plan técnico

## Diseño

- `dashboard/message-pricing.ts`: tabla USD (1-oct-2026), regiones por prefijo
  (coincidencia más larga), `waMarket(phone)` y `waCost(phone, category, type)`.
- `Message.pricing { category, type, market, usd }`; `handleAck` recibe el
  `pricing` del webhook de Cloud API y lo guarda una sola vez.
- `Tenant.messageCosts { smsPerSegment, emailPer1000 }`.
- `DashboardCostsService.costs(tenantId, range)`: agregaciones sobre
  `messages` (WhatsApp por `pricing`; IG/MS/correo con `$lookup` de la
  conversación), `campaign_recipients` + `campaigns` (SMS/correo) y
  `api_sms_messages`.
- Rutas: `GET /dashboard/costs?range=`, `PUT /dashboard/costs/settings`.
- Frontend: tarjeta «Costos de mensajes» en el dashboard (solo administrador),
  modal de tarifas (2 campos).

## Seguridad

Solo TENANT_ADMIN; todas las consultas filtran por `tenantId`.

## Estrategia de pruebas

Unitarias de la tabla; e2e de costos; unitaria de la tarjeta.

## Fases

1. Tabla y captura → 2. Servicio y rutas → 3. Tarjeta.
