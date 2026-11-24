# HU68 — Cotizaciones desde la oportunidad

## Historia

**Como** vendedor,
**quiero** armar una cotización desde la oportunidad y mandarla por WhatsApp o email con un link de pago,
**para** cerrar la venta sin salir de Maya.

## Contexto (estado actual)

- No hay cotizaciones ni productos propios (el agente IA usa WooCommerce, `ai-agents/store`).
- Zoho, Bitrix24 y Clientify sí tienen cotizaciones.

## Propuesta

1. Catálogo simple de productos o servicios por empresa: nombre, precio, IGV incluido o no y unidad. Se puede importar desde WooCommerce.
2. Cotización:
   - Ítems, descuentos, IGV, total y validez.
   - PDF con el logo de la empresa (`branding`).
   - Envío por WhatsApp (documento) o por email.
   - Estado: enviada, vista, aceptada o rechazada, con un link público para aceptarla.
3. Link de pago opcional con la cuenta de Mercado Pago de la empresa (la misma conexión de HU67).
4. Al aceptarse o pagarse, la oportunidad pasa a "Ganada" con el monto.

## Fuera de alcance

- Emitir la factura SUNAT del cliente (posible historia futura con el mismo `InvoiceProvider` de HU49).

## Criterios de aceptación (borrador)

- C1: la cotización calcula bien el subtotal, el IGV y el total (prueba unitaria) y el PDF los muestra.
- C2: aceptar desde el link público mueve la oportunidad a "Ganada".
