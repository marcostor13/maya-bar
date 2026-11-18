# HU18 — Costos de los mensajes en el dashboard (administrador)

## Historia

**Como** administrador de una empresa,
**quiero** ver en el dashboard cuánto me cuestan los mensajes que envío por cada canal,
**para** controlar el gasto de WhatsApp, SMS y correo y decidir dónde invertir.

## Contexto

- Investigación de tarifas oficiales: `docs/costos-mensajes.md` (WhatsApp por mensaje entregado según categoría y país, vigente desde 1-oct-2026; Instagram y Messenger gratis; SMS por segmento según el proveedor; correo según el plan de Resend).
- Meta informa en el webhook de estados (`statuses[].pricing`) si el mensaje se cobra (`type`) y su categoría.
- Hoy no se guarda esa información ni hay costos en el dashboard.

## Qué se espera

1. Guardar en cada mensaje de WhatsApp la categoría y el tipo de cobro que informa Meta.
2. Tarjeta «Costos de mensajes» en el dashboard, por periodo: total estimado en USD y desglose por canal (WhatsApp por categoría, SMS por segmentos, correo, Instagram y Messenger a 0).
3. Costo por segmento de SMS y costo por cada 1.000 correos configurables por la empresa.
4. Aviso claro de que son estimaciones con tarifas de lista y enlace a la fuente.
