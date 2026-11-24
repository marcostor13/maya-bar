# HU54 — Precio fundador y cupones · Spec

## Alcance

### Colección `coupons`
- Campos: `code` (único, en mayúsculas), `type` (`percent` o `fixed`), `value` y `currency` (solo para `fixed`).
- Restricciones: `plans[]` y `periods[]` (vacío = todos); `duration` (`once`, `months` o `forever`) con `durationMonths`.
- Cupos y vigencia: `maxUses` y `used`, `validFrom`/`validUntil`, `active`, `label`.

### Cupón `FUNDADOR`
- Se crea al arrancar si no existe: 30 %, de por vida, solo trimestral o anual, 30 cupos.
- `GET /public/checkout/founder` devuelve los cupos que quedan.
- La landing muestra "Quedan N cupos fundador" con un enlace al checkout que ya lleva el cupón.

### Cotización
- `GET /public/checkout/quote?coupon=` y `GET /billing/checkout/quote`.
- Validan el cupón y devuelven `listSubtotal`, `discount`, `subtotal` (con descuento), y el IGV y el total sobre el precio con descuento.
- Si el cupón no aplica: 400 con el motivo. Los motivos posibles:
  - "Cupón no válido".
  - "Este cupón venció".
  - "Este cupón aún no está vigente".
  - "Este cupón es solo para pago trimestral o anual".
  - "Este cupón no aplica a este plan".
  - "Cupos agotados".
  - Moneda distinta.

### Reserva del cupo
- Al crear el checkout se reserva un cupo de forma atómica (`used < maxUses`).
- Si Mercado Pago falla al abrir el pago, el cupo se libera.
- El cron `releaseExpired` libera los cupos con más de 24 h sin pago aprobado.
- Si un pago se aprueba después de liberado, el cupo vuelve a contar.

### Precio pactado
- `subscription.amount` guarda el precio con descuento.
- `subscription.discount` guarda `{ code, type, value, endsAt? }`. `endsAt` vale:
  - `once`: fin del primer periodo.
  - `months`: hoy + N meses.
  - `forever`: sin fin.
- El descuento se mantiene en las renovaciones de pago único y en los cambios de plan de HU52 (`agreedPrice`).
- La renovación que empieza cuando el descuento ya terminó va a precio de lista.
- El cron `expireDiscounts` devuelve el monto pactado al de lista y, en mensual, lo lleva a Mercado Pago.

### Comprobante
- El primer pago con cupón va con la línea a precio de lista y `descuento`, más `total_descuento`.
- La descripción dice "Cupón X (−N %)".

### Checkout (UI)
- Campo "¿Tienes un cupón?" y `?cupon=` en la URL.
- Línea de descuento. Si el cupón no aplica, se muestra el motivo inline y con un toast, y se cotiza sin él.

### Superadmin (API)
- `GET`/`POST /billing/admin/coupons` y `PATCH /billing/admin/coupons/:id`. El código no se edita.

## Fuera de alcance
- La pantalla de cupones en superadmin: va en HU57.
- Mostrar el descuento en los comprobantes de las renovaciones: solo se muestra en el primer pago.

## Criterios de aceptación
- **C1:** con `FUNDADOR`, Crece anual cuesta 2.490 × 0,7 = S/ 1.743 + IGV en el checkout y en el comprobante.
- **C2:** el cupón 31 se rechaza con "Cupos agotados".
- **C3:** `FUNDADOR` en periodo mensual se rechaza con el motivo.
