# HU68 — Cotizaciones desde la oportunidad · Especificación

Historia: `hu.md` · Fecha: 2026-11-24 · Estado: aprobada

## Objetivo
Que el vendedor arme una cotización desde la oportunidad, la mande por WhatsApp o email con un link para aceptarla o pagarla, y que la oportunidad se gane sola al cerrarse.

## Alcance
- **Incluye:**
  - Catálogo por empresa (nombre, precio, IGV incluido o no, unidad), con importación desde WooCommerce.
  - Cotización con ítems, descuento por línea, IGV (18 %, 10.5 % o exonerado), validez, notas y numeración COT-0001 por empresa.
  - PDF con el logo y el color de la marca.
  - Envío por WhatsApp (PDF como documento, con la ventana de 24 h abierta) o por email (link y PDF).
  - Estados: borrador, enviada, vista, aceptada, rechazada y pagada.
  - Link público `/q/:token` para aceptar, rechazar o pagar con el Mercado Pago de la empresa (conexión de HU67, sin comisión de Maya).
  - Al aceptar o pagar, la oportunidad pasa a la etapa ganada con el monto de la cotización.
- **Fuera de alcance:** factura SUNAT del cliente.

## Requisitos (EARS)
- **R1** — El sistema debe calcular el subtotal, el IGV y el total de la cotización y mostrarlos en el PDF.
- **R2** — Cuando el cliente acepta la cotización desde el link público, el sistema mueve la oportunidad a la etapa ganada.

## Criterios de aceptación
| # | Req. | Criterio | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | Subtotal, IGV y total correctos y visibles en el PDF | Unitaria `quote-calc.spec` + e2e que extrae el texto del PDF |
| C2 | R2 | Aceptar desde el link público mueve la oportunidad a Ganada | e2e |
