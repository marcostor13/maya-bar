# HU67 — Pago en línea de entradas de eventos · Especificación

Historia: `hu.md` · Fecha: 2026-11-24 · Estado: aprobada

## Objetivo
Que los invitados paguen su entrada en la landing con tarjeta o Yape, y que el dinero vaya a la cuenta de Mercado Pago de la productora.

## Alcance
- **Incluye:**
  - Conexión OAuth de la cuenta de Mercado Pago de la empresa (Marketplace).
  - Tipos de entrada con precio, cupo y fecha de corte, y cupo total del evento.
  - Compra con Checkout Pro y comisión de Maya (`marketplace_fee`, `EVENT_TICKET_FEE_PCT`, 3 % por defecto).
  - Webhook firmado: pagada, rechazada o reembolsada.
  - Reserva del cupo durante 30 min, liberada por cron.
  - Check-in solo con la entrada pagada.
  - Correo con la entrada y el QR al pagar.
  - Reembolso desde el asistente.
- **Fuera de alcance:** comprobante SUNAT de la entrada (lo emite la productora).

## Requisitos (EARS)
- **R1** — Cuando Mercado Pago aprueba el pago, el sistema marca la entrada como pagada. Mientras no esté pagada, el check-in la rechaza.
- **R2** — Cuando se crea la compra, el sistema debe crear la preferencia en la cuenta de la empresa con la comisión configurada para Maya.
- **R3** — Si el cupo del tipo de entrada está agotado, el sistema rechaza la compra.

## Criterios de aceptación
| # | Req. | Criterio | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | Un pago aprobado marca la entrada como pagada y el check-in la acepta; una pendiente se rechaza en la puerta | e2e |
| C2 | R2 | La preferencia incluye la comisión configurada para Maya | e2e |
| C3 | R3 | Con el cupo agotado no se puede comprar | e2e |
