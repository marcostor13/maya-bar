# HU52 — Cambio de plan y cancelación · Cierre

- **Cerrada:** 2026-11-24
- **Estado:** Terminada
- **Verificación (spec-verifier):** C1 y C3 CUMPLE, C2 PARCIAL. Hallazgos corregidos:
  1. **Cancelación que seguía cobrando:** primero se pausa el `preapproval`. Si Mercado Pago falla, responde 503 y no se marca nada; repetir la cancelación vuelve a pausar.
  2. **Doble pago de la subida:** solo puede haber un pago de subida abierto (409); el enlace vence a los 30 min (`expiration_date_to`).
  3. **Subida vieja:** `applyPaidUpgrade` solo aplica si siguen el plan y el fin de periodo de la cotización. Si no, no toca el plan y avisa al superadmin para reembolsar.
  4. **Bajada en pago único:** la renovación pagada por adelantado a un plan menor deja `pendingPlan` + `pendingPlanFrom`, y el cron `applyScheduled` la aplica al fin del periodo. Una bajada programada después del aviso se conserva.
  5. **Texto engañoso:** ya no dice "solo lectura" para los recursos de más; dice que siguen funcionando pero no se pueden añadir más.
  6. **Impago:** en `past_due` se puede cancelar y se cierra en el momento.
  7. **Bajada sobre un plan cancelado:** no se permite.
  8. **Rechazo durante la cancelación:** ya no pasa la cuenta a `past_due`.
  10. **ESC:** cierra los modales esté donde esté el foco.
  12. **Prueba intermitente de `MercadoPagoClient`:** corregida, con reloj falso sin avance automático.
  - Pruebas nuevas: subida duplicada y vieja, fallo de MP al cancelar, cancelar en impago, bajada sobre un plan cancelado, deshacer la bajada y bajada en pago único.
- **Commits:** sin commit

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Subir de Inicia a Crece cobra la diferencia prorrateada y activa Crece al aprobarse | CUMPLE | `backend/src/billing/prorate.spec.ts`, `backend/test/plan-change.e2e-spec.ts` |
| C2 | Cancelar un mensual deja de cobrar en MP y mantiene el acceso hasta `currentPeriodEnd` | CUMPLE | e2e (incluye fallo de MP) |
| C3 | Bajar a Inicia con 5 usuarios pide elegir 2; el resto queda sin acceso sin borrarse | CUMPLE | e2e, `plan-change-panel.spec.ts` |

## Pendientes, riesgos y notas

- **Recursos de más que no son usuarios** (números, agentes, buzones): solo se informan; no se elige cuáles conservar.
- **Usuarios desactivados por plan:** se cortan con el TTL de la caché (≤ 60 s) y sin entrada en la auditoría de usuarios.
- **Bajada deshecha después del aviso de renovación:** si el cliente paga el enlace viejo (al plan menor), la bajada vuelve a programarse.
- **Subidas viejas pagadas:** se reembolsan a mano (aviso al superadmin; R5).
- **Mercado Pago real:** sin probar; hay que validar `paused`, `authorized` y el cambio de `transaction_amount` con credenciales de prueba.
