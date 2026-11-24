# HU53 — Add-ons y recargas · Cierre

- **Cerrada:** 2026-11-24
- **Estado:** Terminada
- **Verificación (spec-verifier):** C1 y C2 CUMPLE. Hallazgos corregidos:
  1. **Alta del add-on no atómica:** ahora todo con `$inc` (`addonItems.<id>`, `addons.<límite>`, `subscription.amount`). Dos compras a la vez suman las dos.
  2. **Cupo de emails saltable:** el contador atómico `emailQuota` cuenta lo encolado en el mes; dos campañas no ven el mismo cupo y un reenvío no lo libera.
  3. **`apply` repetible:** es idempotente por compra; `appliedPurchases` se marca en el mismo update.
  4. **Add-on pagado sin plan activo:** no se aplica, no deja `amount = NaN` y se registra para reembolso.
  5. **Emails reservados:** se devuelven si el encolado falla (`refundCampaignEmails`).
  6. **Checkout de plan desde la cuenta:** suma los add-ons ya contratados (`GET /billing/checkout/quote`, línea "Extras contratados").
  7. **Recarga sobre un saldo vencido:** primero se pone en cero de forma condicional y luego se suma con `$inc`; dos recargas a la vez suman las dos.
  8. **Textos:** el correo y la pantalla de resultado de un add-on hablan de "tu compra", no de "tu plan".
  9. **"Comprar add-on":** solo aparece para recursos que tienen add-on, y compra en un paso (abre Mercado Pago directo).
  10. **Precios:** muestran "+ IGV" y explican que el extra entra en el próximo cobro o renovación.
  11. **Pruebas nuevas:**
      - 403 para quien no es administrador;
      - prorrateo menor a 1;
      - idempotencia y concurrencia;
      - recarga vencida;
      - cupo de emails y su devolución;
      - compra en un paso desde el aviso.
- **Commits:** sin commit

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | 1.000 créditos aprobados suben el saldo en 1.000 y generan comprobante | CUMPLE | `backend/test/addons.e2e-spec.ts` |
| C2 | Usuario extra en Inicia permite el 3.er usuario y suma S/ 39 al cobro mensual | CUMPLE | `backend/test/addons.e2e-spec.ts` |

## Pendientes, riesgos y notas

- **Subida o bajada de plan (HU52) a la vez que se aplica un add-on:** recalculan el monto con `addonItems` leído antes. Es una carrera de muy baja probabilidad.
- **Quitar un add-on mensual:** a mano, por soporte.
- **Mercado Pago real:** sin probar.
- **Prueba intermitente:** una corrida de `npm test` tuvo 1 fallo que no se repitió.
