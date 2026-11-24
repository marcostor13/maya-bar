# HU67 — Plan

## Backend
- `MercadoPagoClient`: token de la empresa (`createPreferenceFor`, `getPaymentFor`, `refundPaymentFor`) y `oauthToken` (canje y renovación).
- `Event.ticketTypes` / `onlinePayment` / `currency`. `mergeTicketTypes` conserva `sold` por clave y no deja bajar el cupo ni borrar tipos con ventas.
- `EventRegistration`: `paymentStatus`, importe, comisión, ids de Mercado Pago y `holdExpiresAt`.
- Módulo `event-tickets`:
  - Conexión con `state` HMAC y tokens cifrados con `SecretBox`.
  - Checkout con reserva atómica (`$elemMatch` + `$inc`).
  - Webhook `public/event-payments/webhook` con firma.
  - Cron de reservas vencidas y reembolso auditado.
- Registro gratuito cerrado en eventos con venta en línea. Check-in exige `paid`. La landing pública recibe `payments.online`.

## Frontend
- Editor de tipos de entrada en la pestaña General.
- Tarjeta "Cobro de entradas" en Configuración.
- Selector de entradas y compra en la landing, con vuelta `?pago=`.
- Estado de pago y reembolso en Asistentes.
