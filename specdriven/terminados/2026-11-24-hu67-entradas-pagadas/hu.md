# HU67 — Pago en línea de entradas de eventos

## Historia

**Como** productora de eventos que usa Maya,
**quiero** que mis invitados paguen su entrada en la landing del evento con tarjeta o Yape,
**para** asegurar la asistencia y cobrar antes del evento.

## Contexto (estado actual)

- Los eventos tienen precio, pero se paga en el local (HU33: "Reservar entrada · S/ 30" y "se paga en el local").
- Registro, entrada guardada, check-in en la puerta y landing con dominio propio ya existen.
- La integración con Mercado Pago se construye en HU45, con la cuenta **de Maya**.

## Propuesta

1. Cada empresa conecta **su propia** cuenta de Mercado Pago por OAuth (Mercado Pago Marketplace), así el dinero de las entradas no pasa por Maya.
2. En la landing del evento con precio: "Comprar entrada · S/ 30".
   - Va a Checkout Pro de la cuenta de la empresa.
   - La entrada queda `pending` hasta el webhook y luego `paid`.
   - El QR de check-in solo vale si está pagada.
3. Tipos de entrada (general, VIP o preventa) con cupo propio y fecha de corte.
4. **Comisión de Maya** por entrada vendida (`marketplace_fee`, por ejemplo 3 %, configurable): un ingreso nuevo.
5. Correo con la entrada y el QR al pagar. Reembolso desde el detalle del asistente.

## Fuera de alcance

- Comprobante SUNAT de la entrada: lo emite la productora.

## Criterios de aceptación (borrador)

- C1: un pago aprobado marca la entrada como pagada y el check-in la acepta; una entrada pendiente se rechaza en la puerta.
- C2: la preferencia incluye la comisión configurada para Maya.
- C3: si el cupo del tipo de entrada se agota, no se puede comprar.
