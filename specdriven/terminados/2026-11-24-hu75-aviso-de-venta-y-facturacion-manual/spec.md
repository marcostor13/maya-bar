# HU75 — Aviso de cada venta y facturación manual · Especificación

Historia: `hu.md` · Fecha: 2026-11-24 · Estado: aprobada (pedido del usuario)

## Objetivo

Que el dueño se entere de cada venta al momento y tenga en el correo todo lo
necesario para emitir el comprobante a mano, sin que Maya intente emitirlo sola
mientras la integración con Nubefact no está lista.

## Usuarios

- Dueño / superadmin: recibe el aviso y lleva el control de lo facturado.

## Alcance

- Incluye: correo por cada pago aprobado (alta, renovación, add-on, recarga,
  implementación); modo de facturación manual por defecto; pestaña "Por
  facturar" y "Marcar facturado" en el panel de facturación del superadmin.
- **Fuera de alcance (pendiente):** emisión automática con Nubefact (sigue en
  el código, se activa con `INVOICING_AUTO=true`), enviar al cliente el
  comprobante hecho a mano, subir el PDF del comprobante manual.

## Requisitos (EARS)

Funcionales:
- **R1** — Cuando un pago pasa a aprobado, el sistema debe enviar un correo
  "Nueva venta" a cada dirección de `SALES_NOTIFY_EMAIL` (separadas por coma;
  por defecto `admin@ignia.site`) con: concepto, monto y moneda, fecha, medio
  de pago, id del pago en Mercado Pago, empresa, comprador (nombre, correo,
  teléfono) y datos de facturación (tipo, documento, razón social, dirección,
  correo de facturación) cuando existan.
- **R2** — Si el mismo pago se notifica más de una vez (reintentos del
  webhook), entonces el correo debe salir una sola vez.
- **R3** — Si `INVOICING_AUTO` no es `true`, cuando un pago pasa a aprobado el
  sistema debe dejar su comprobante en estado `manual` y no llamar al
  proveedor de facturación.
- **R4** — Si `INVOICING_AUTO=true`, el comportamiento de HU49 no cambia.
- **R5** — El superadmin debe poder listar los pagos en estado `manual`
  (`GET /billing/admin/receipts?status=manual`).
- **R6** — Cuando el superadmin marca un pago manual como facturado (con una
  referencia opcional, p. ej. `B001-15`), el sistema debe dejarlo como "No
  aplica" con el motivo "Facturado a mano" y la referencia, y sacarlo de la
  lista. Si el pago no está en `manual`, entonces debe responder 400.

No funcionales:
- **R7** (seguridad) — Listar y marcar solo lo puede el `SUPERADMIN`.
- **R8** (fiabilidad) — Un fallo al enviar el aviso nunca frena el cobro ni el
  alta (se registra en la bitácora de correos y se puede reenviar).

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | Dado un pago de compra aprobado, cuando se procesa, entonces sale un correo a `admin@ignia.site` con el plan, el monto, el id de MP y el documento de facturación | e2e de API |
| C2 | R2 | Dado el mismo pago aprobado dos veces, entonces hay un solo correo "Nueva venta" | e2e de API |
| C3 | R3 | Sin `INVOICING_AUTO`, el pago aprobado queda con `receipt.status = manual` y el proveedor no se llama | e2e de API |
| C4 | R4 | Con `INVOICING_AUTO=true`, queda `pending` como antes | prueba unitaria |
| C5 | R5, R6, R7 | El superadmin lista los `manual`, marca uno con `B001-15` y desaparece de la lista; marcar otra vez → 400; un administrador de empresa → 403 | e2e de API |
| C6 | R6 | En el panel, la pestaña "Por facturar" lista los pagos y "Marcar facturado" llama a la API y muestra toast | prueba unitaria del frontend |
| C7 | R1 | **[usuario]** Llega el correo real a admin@ignia.site con la primera compra | manual |

## Supuestos y decisiones por defecto

- "Pendiente" = Nubefact no se usa hasta que el usuario lo pida; no se borra.
- Los pagos ya aprobados antes de este cambio no se tocan.
- Se reutiliza la bitácora de correos de cobro (`billing_emails`) para no
  repetir y poder reenviar.

## Preguntas abiertas

- Ninguna.
