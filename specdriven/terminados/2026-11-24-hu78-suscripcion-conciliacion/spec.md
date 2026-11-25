# HU78 — Conciliación de compras y cancelación desde Mercado Pago · Especificación

Historia: `hu.md` · Fecha: 2026-11-24 · Estado: aprobada (pedido del usuario: "analiza si la suscripción mensual funciona")

## Objetivo

Análisis de producción (24-11): dos compras mensuales creadas (preapproval
`pending`), ningún evento de Mercado Pago recibido. El webhook responde y
procesa (prueba firmada → `processed`), pero si Mercado Pago no avisa, la
conciliación existente solo revisa pagos ya guardados: una compra pagada se
quedaba sin activar. Además, si el cliente cancela desde la app de Mercado
Pago, Maya no se enteraba.

## Alcance

- Incluye: cron de conciliación de compras, reacción a preapproval `cancelled`,
  error claro al reactivar una suscripción cancelada en Mercado Pago.
- **Fuera de alcance:** Yape en mensual (Mercado Pago solo cobra suscripciones
  con tarjeta), pantalla "Mi plan" (ya muestra plan, próximo cobro, pagos,
  cancelar y reactivar).

## Requisitos (EARS)

- **R1** — Cada 10 minutos, las compras `pending`/`awaiting_payment` de entre
  10 minutos y 7 días deben consultarse en Mercado Pago: mensual por su
  preapproval y sus cobros autorizados; pago único (y la implementación
  aparte) por `external_reference`. Un pago aprobado activa la cuenta igual que
  el webhook.
- **R2** — Cuando llega un preapproval `cancelled` de la suscripción vigente y
  activa, debe quedar `cancelAtPeriodEnd` (acceso hasta el fin del periodo
  pagado) con motivo "Cancelada desde Mercado Pago".
- **R3** — Si al reactivar Mercado Pago rechaza reanudar, debe responderse 400
  con un mensaje que pida volver a elegir el plan.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|------|--------------------------|------------------|
| C1 | R1 | Mensual con preapproval autorizado y cobro aprobado sin webhook → empresa activa mensual, compra `fulfilled` | e2e `checkout-reconcile` |
| C2 | R1 | Anual sin webhook, pago encontrado por referencia → empresa activa anual | e2e `checkout-reconcile` |
| C3 | R1 | Compra recién creada → no se consulta | e2e `checkout-reconcile` |
| C4 | R2, R3 | Preapproval `cancelled` → activa con `cancelAtPeriodEnd`; reactivar → error "Vuelve a elegir tu plan" | e2e `checkout-reconcile` |
