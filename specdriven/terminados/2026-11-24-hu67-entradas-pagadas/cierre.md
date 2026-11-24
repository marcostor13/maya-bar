# Cierre HU67 — Pago en línea de entradas

## Qué quedó
- **Conexión:** Configuración → Cobro de entradas conecta la cuenta de Mercado Pago de la empresa por OAuth. El `state` va firmado y los tokens se guardan cifrados y se renuevan antes de vencer.
- **Tipos de entrada** (pestaña General del evento): nombre, precio, cupo y "venta hasta". No se puede quitar un tipo con ventas ni bajar su cupo por debajo de lo vendido.
- **Compra en la landing:**
  1. El invitado elige el tipo y la cantidad.
  2. Se reserva el cupo de forma atómica durante 30 min.
  3. Va a Checkout Pro de la empresa con `marketplace_fee`.
  4. Al volver ve el aviso (`?pago=`).
- **Webhook firmado:**
  - Aprobado → pagada, más el correo con la entrada y el QR.
  - Rechazado → libera el cupo.
  - Reembolsado o contracargo → cancelada.
  - Un pago tardío tras vencer vuelve a sumar el cupo.
  - Las notificaciones repetidas no cambian nada.
- **Puerta:** una entrada sin pagar se rechaza ("no está pagada").
- **Reembolso** desde Asistentes, con confirmación; queda en la auditoría.

## Verificación
spec-verifier sigue bloqueado por el hook, así que la verificación es propia:
- **C1 CUMPLE** — `test/event-tickets.e2e-spec.ts` C1:
  - Una entrada pendiente da 409 "no está pagada" en el check-in.
  - Con firma falsa da 401 y la entrada sigue pendiente.
  - Con el aviso firmado y el pago `approved` consultado con el token de la empresa, queda `paid` y el check-in la acepta.
  - Un aviso repetido no la cuenta dos veces.
- **C2 CUMPLE** — e2e C2:
  - La preferencia se crea con el token de la empresa y `marketplace_fee` 8: el 5 % de 160, con `EVENT_TICKET_FEE_PCT=5`.
  - Lleva `external_reference` y `notification_url`.
- **C3 CUMPLE** — e2e C3:
  - Con el cupo 2 lleno, la compra da 409 "Se agotaron" y el cupo no cambia.
  - Un pago rechazado libera el cupo y se puede volver a comprar.
  - El cron libera las reservas vencidas.
- **Además:**
  - Conexión OAuth (un `state` alterado no conecta) y registro gratuito cerrado.
  - Reembolso: llama a Mercado Pago, cancela y libera el cupo; la otra empresa recibe 403.
  - Reglas de cupo al editar.
  - `app.e2e` en verde (el callback se añadió a las rutas públicas) y unitarias de eventos y Mercado Pago 46/46.
  - Frontend 1002/1003. La que falló es `landing.spec` de HU56, por tiempo bajo carga; sola pasa 6/6.
  - Build y lint OK.

## Pendiente [usuario]
- Crear la app Marketplace en Mercado Pago y configurar en Coolify:
  - `MP_CLIENT_ID` y `MP_CLIENT_SECRET`.
  - La redirect URI `{PUBLIC_API_URL}/event-tickets/mp/callback`.
  - `EVENT_TICKET_FEE_PCT`.
- Prueba real con cuentas de prueba (vendedor y comprador).
