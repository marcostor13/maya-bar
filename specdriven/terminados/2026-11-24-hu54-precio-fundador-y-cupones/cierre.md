# HU54 — Precio fundador y cupones · Cierre

- **Cerrada:** 2026-11-24
- **Estado:** Terminada
- **Verificación (spec-verifier):** C1, C2 y C3 CUMPLE. Hallazgos corregidos:
  1. **Descuento que quedaba tras una compra sin cupón:** `activatePlan` lo quita salvo en las renovaciones del mismo plan (`renewal`).
  2. **`reclaim` duplicable:** ahora es `reclaimSession`, una sola vez por compra (`coupon.reclaimedAt` condicional).
  3. **Liberación doble:** `releaseSession` marca la sesión o libera directo si no se guardó; el cron ya no vuelve a liberarla.
  4. **Restricción de plan y periodo del cupón:** se guarda en `subscription.discount`, y `agreedPrice` deja de descontar si cambia el plan o el periodo.
  5. **Cupón "una vez" en mensual automático:** termina 2 días antes del cobro, para que el monto nuevo llegue a Mercado Pago.
  6. **Pago rechazado:** libera su cupo a la hora, no a las 24 h.
  7. **Comprobantes:** el descuento y "Cupón X" solo van en el primer pago de la compra.
  8. **Cupón de monto fijo:** exige moneda.
  9. **Cupón `months`:** cuenta desde el inicio del periodo pagado.
  10. **Checkout:** al cambiar plan, periodo o moneda vuelve a probar el cupón escrito, sin repetir el aviso; ignora las respuestas viejas.
  11. **Pruebas nuevas:**
      - liberación exacta;
      - pago tardío con reclaim idempotente;
      - fallo de Mercado Pago;
      - descuento que se quita o se conserva;
      - restricción por plan o periodo (`agreed-price.spec.ts`);
      - reintento del cupón en la UI.
- **Commits:** sin commit

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | FUNDADOR, Crece anual = S/ 1.743 + IGV en el checkout y el comprobante | CUMPLE | `backend/test/coupons.e2e-spec.ts`, `checkout.spec.ts` |
| C2 | El cupo 31 se rechaza con "Cupos agotados" (también a la vez) | CUMPLE | `backend/test/coupons.e2e-spec.ts` |
| C3 | FUNDADOR en mensual se rechaza con el motivo | CUMPLE | `backend/test/coupons.e2e-spec.ts`, `checkout.spec.ts` |

## Pendientes, riesgos y notas

- **Tope de 30 cupos:** un pago aprobado después de liberado su cupo vuelve a contar y puede pasar el tope. Se respeta porque el cliente ya pagó con descuento.
- **Abuso del FUNDADOR:** no se impide que la misma empresa o el mismo correo lo use dos veces. La cotización permite probar códigos a 60/min por IP.
- **Pantalla de cupones en superadmin:** va en HU57; la API ya está.
- **Nubefact:** `descuento` y `total_descuento` están sin probar contra la demo, porque necesitan `NUBEFACT_URL` y `NUBEFACT_TOKEN`.
- **Landing ("Quedan N cupos"):** sin prueba automática.
