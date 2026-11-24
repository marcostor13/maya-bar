# HU52 — Cambio de plan y cancelación · Spec

Solo para una cuenta con plan pagado activo (`subscription.status = active` con periodo, moneda y fin). Solo lo hace el `TENANT_ADMIN`; los roles personalizados no. Endpoints en `billing/plan/*`.

## Requisitos

- **R1 — Subir** (`POST /billing/plan/upgrade`):
  - Se cobra por Checkout Pro (pago único, sesión `kind: 'upgrade'`) `prorate()`: lo que falta del periodo × (precio nuevo − precio pactado), más IGV en PEN.
  - Al aprobarse el pago (`applyUpgrade`):
    - El plan y el precio pactado cambian.
    - El fin del periodo no cambia.
    - Se reactivan los usuarios desactivados por plan, si hay cupo.
    - En mensual, el `preapproval` cobra el monto nuevo desde el siguiente ciclo (`preapprovalAmountTarget`; reintenta cada 10 min).
  - Si el monto prorrateado es menor a 1, el cambio entra sin cobro.
- **R2 — Bajar** (`POST /billing/plan/downgrade`):
  - Queda `pendingPlan` y entra con el siguiente cobro (mensual, `applyPending`) o con la renovación (pago único, `activatePlan`).
  - Si hay más usuarios activos que el nuevo límite: 409 `CHOOSE_USERS`. El cliente elige exactamente `limit` usuarios, con al menos un administrador.
  - Al entrar la bajada, el resto se desactiva (`deactivatedByPlan`); no se borra.
  - Se informa qué otros recursos superan el límite.
  - En mensual, el `preapproval` pasa al monto nuevo.
  - Se puede deshacer (`DELETE /billing/plan/downgrade`).
- **R3 — Cancelar** (`POST /billing/plan/cancel`, motivo opcional):
  - Queda `cancelAtPeriodEnd` y el `preapproval` se pausa en Mercado Pago, que deja de cobrar.
  - El acceso sigue hasta `currentPeriodEnd`.
  - Al terminar el periodo (`endCanceled`), la cuenta pasa a `canceled` (solo lectura, HU51) y el `preapproval` queda para cancelarse.
  - No dispara avisos de impago ni de renovación.
- **R4 — Reactivar** (`POST /billing/plan/reactivate`): antes del fin del periodo deshace la cancelación (el `preapproval` vuelve a `authorized`).
- **R5:** sin reembolsos automáticos.
- **R6:** correos de cambio de plan (subida, bajada programada, cancelación) por la bitácora HU50.
- **R7:** Mi plan muestra las opciones con el monto de hoy y la fecha de entrada, la elección de usuarios, la cancelación con motivo y la reactivación. Toast y Confirm como en el resto de la app.

## Criterios de aceptación

| # | Criterio | Prueba |
|---|---|---|
| C1 | Subir de Inicia a Crece a mitad de mes cobra la diferencia prorrateada y activa los límites de Crece al aprobarse | `backend/src/billing/prorate.spec.ts`, `backend/test/plan-change.e2e-spec.ts` |
| C2 | Cancelar un mensual deja de cobrar en Mercado Pago y mantiene el acceso hasta `currentPeriodEnd` | e2e |
| C3 | Bajar a Inicia con 5 usuarios pide elegir 2; el resto queda sin acceso pero no se borra | e2e, `plan-change-panel.spec.ts` |
