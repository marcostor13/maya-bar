# HU52 — Cambio de plan y cancelación

## Historia

**Como** cliente de Maya,
**quiero** subir, bajar o cancelar mi plan yo mismo,
**para** pagar por lo que uso sin escribir a soporte.

## Contexto (estado actual)

- No hay suscripción ni cambio de plan (depende de HU48).

## Propuesta

1. **Subir de plan**:
   - Efecto inmediato, con cobro prorrateado de la diferencia por los días que quedan, por pago único de Checkout Pro.
   - En mensual se actualiza el monto del `preapproval` desde el siguiente ciclo.
2. **Bajar de plan**:
   - Efecto al final del periodo (`pendingPlan`).
   - Si el uso supera el nuevo límite, se avisa antes qué queda en solo lectura (usuarios, números o agentes de más) y el cliente elige cuáles conservar.
3. **Cancelar**:
   - `cancelAtPeriodEnd`: sigue activa hasta el fin del periodo pagado y luego pasa a `expired` (solo lectura, HU51).
   - Pregunta el motivo (opcional, para medir la baja).
   - En mensual se cancela el `preapproval` en Mercado Pago.
4. **Reactivar** antes del fin del periodo deshace la cancelación.
5. Sin reembolsos automáticos. Un reembolso lo hace el superadmin (HU57), con nota de crédito (HU49).

## Criterios de aceptación (borrador)

- C1: subir de Inicia a Crece a mitad de mes cobra la diferencia prorrateada (prueba unitaria del cálculo) y activa los límites de Crece al aprobarse el pago.
- C2: cancelar un mensual deja de cobrar en Mercado Pago y mantiene el acceso hasta `currentPeriodEnd`.
- C3: bajar con 5 usuarios a Inicia pide elegir 2 activos; el resto queda sin acceso, pero no se borra.
