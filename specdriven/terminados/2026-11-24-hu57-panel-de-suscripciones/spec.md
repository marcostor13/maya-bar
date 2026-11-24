# HU57 — Panel de suscripciones e ingresos (superadmin) · Spec

## Alcance
Todo va en `/admin/billing` (solo SUPERADMIN), con la entrada "Suscripciones" en el menú de la plataforma.

### Resumen
- **MRR por moneda:** suscripciones `active` normalizadas a mensual (monto pactado sin IGV ÷ meses del periodo).
- **Ingresos por plan.**
- **Clientes que pagan:**
  - nuevos del mes: primer pago aprobado este mes;
  - bajas del mes y churn % (bajas ÷ (activas + impagas + bajas)).
- **Pruebas:**
  - pruebas activas;
  - conversión de prueba a pago: de las empresas creadas en los últimos 90 días, cuántas tienen un pago.
- **Cobros:**
  - cuentas `past_due`, con enlace a la lista filtrada;
  - cobrado en el mes, con IGV.

### Suscripciones
- **Lista** con filtros por estado, plan y periodo, buscador (empresa, email, RUC) y paginación de 50.
- **Ficha a pantalla completa** con:
  - estado, plan, periodo, precio pactado, vencimiento, tipo de cobro y cupón;
  - historial de pagos con su comprobante y nota de crédito (estado, código, PDF);
  - implementación;
  - bitácora de acciones.
- **Acciones**, cada una registrada en `billing_admin_actions` con quién la hizo:
  - **Alargar la prueba:** de 1 a 60 días, solo en cuentas que nunca pagaron un plan.
  - **Cambiar el plan con precio especial:** el precio pactado sin IGV reemplaza al cupón y no mueve el periodo. En mensual automático se ajusta el monto del preapproval.
  - **Pago manual** (transferencia, Yape u otro):
    - crea el pago `provider: manual`;
    - activa el plan por el periodo (base = total ÷ 1,18 en soles);
    - cancela el preapproval anterior;
    - deja el comprobante en cola.
  - **Reembolso total:**
    - Mercado Pago: `refundPayment` y luego `getPayment` + `syncFromMp`;
    - manual: se marca como reembolsado;
    - en los dos casos se genera la nota de crédito. La suscripción no cambia.
  - **Reenviar el acceso** (usuarios con el acceso pendiente) y **reenviar el comprobante o la nota de crédito**.

### Otras pestañas
- **Cupones** (HU54): lista, alta, edición, pausar y activar.
- **Comprobantes** con error o en cola (HU49), con reintento.
- **Correos** de cobro (HU50), con reenvío.
- **Implementaciones** (HU55): enlace a `/admin/onboarding`.

## Fuera de alcance
- Reembolso parcial.
- Cancelar la suscripción desde el panel; ya está en el detalle de empresa (HU16).
- La bitácora general de auditoría es HU63; aquí la bitácora es propia del panel.

## Criterios de aceptación
- **C1:** el MRR suma las suscripciones activas normalizadas a mensual. Prueba unitaria con mensual, trimestral y anual.
- **C2:** "Pago manual" activa la suscripción y emite el comprobante.
- **C3:** el reembolso llama a Mercado Pago y genera la nota de crédito.
