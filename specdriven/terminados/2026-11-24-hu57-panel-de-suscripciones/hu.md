# HU57 — Panel de suscripciones e ingresos (superadmin)

## Historia

**Como** superadministrador de Maya,
**quiero** ver y gestionar todas las suscripciones, pagos y comprobantes,
**para** saber cuánto factura el negocio y resolver casos sin tocar la base de datos.

## Contexto (estado actual)

- Superadmin tiene `/admin/tenants`, el detalle de empresa y usuarios (HU16–HU19), y los costos de mensajes en el dashboard (HU18).

## Propuesta

1. **Resumen**:
   - MRR (mensual equivalente) y nuevos clientes del mes.
   - Bajas y churn %.
   - Pruebas activas y conversión de prueba a pago.
   - Cuentas en `past_due`.
   - Ingresos por plan.
2. **Lista de suscripciones**, con filtros por estado, plan y periodo, y su detalle:
   - Historial de pagos con sus comprobantes.
   - Acciones:
     - Alargar la prueba.
     - Cambiar el plan con precio especial.
     - Marcar como pago manual (transferencia o Yape directo), que genera comprobante.
     - Reembolsar (Mercado Pago más nota de crédito).
     - Reenviar el acceso o el comprobante.
3. **Cupones** (HU54) y **cola de comprobantes con error** (HU49).
4. **Tareas de onboarding** pagadas (HU55).
5. Cada acción queda registrada con quién la hizo (HU63).

## Criterios de aceptación (borrador)

- C1: el MRR suma las suscripciones activas, normalizadas a mensual (prueba unitaria con mensual, trimestral y anual).
- C2: "Pago manual" activa la suscripción y emite el comprobante.
- C3: el reembolso llama a Mercado Pago y genera la nota de crédito.
