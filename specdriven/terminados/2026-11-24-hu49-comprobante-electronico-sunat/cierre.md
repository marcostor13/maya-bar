# HU49 — Comprobante electrónico SUNAT · Cierre

- **Cerrada:** 2026-11-24
- **Estado:** Terminada (con proveedor simulado; falta la prueba real contra la demo de Nubefact)
- **Verificación (spec-verifier):** 4 CUMPLE. Hallazgos corregidos:
  - **Reembolso antes de emitir:** no se factura; si el reembolso llega mientras se emite, se encola la nota de crédito.
  - **Fechas:** de emisión y de la descripción, en hora de Lima.
  - **Reintento manual:** solo sobre comprobantes fallidos, y repite tanto el comprobante como la nota.
  - **Tipo reservado:** se conserva aunque cambien los datos.
  - **Historial del cliente:** ya no muestra datos internos de la cola.
  - **Enlaces del correo:** se escapan.
  - **Pruebas nuevas:** exportación, límite de S/ 700, 403 de la cola, reintento de un comprobante que no está fallido e historial.
- **Commits:** sin commit

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Un pago de S/ 293,82 con RUC da factura con base 249,00, IGV 44,82 y total 293,82 | CUMPLE | `backend/test/invoicing.e2e-spec.ts` |
| C2 | Correo con los enlaces al PDF y al XML | CUMPLE | ídem |
| C3 | Un reembolso da nota de crédito ligada | CUMPLE | ídem |
| C4 | Si el proveedor cae, el acceso sigue y el comprobante sale al reintentar con el mismo número | CUMPLE | ídem |

## Lo que tiene que hacer el usuario

- Seguir `docs/facturacion-nubefact.md`:
  - Tener el RUC como emisor electrónico.
  - Crear la cuenta en Nubefact y poner `NUBEFACT_URL` y `NUBEFACT_TOKEN` en Coolify.
  - Acordar las series con el contador.
- Si las series ya tienen comprobantes emitidos, ajustar el correlativo inicial en `invoice_counters`.

## Pendientes, riesgos y notas

- Pantalla de la cola para el superadmin: HU57 (hoy solo hay API).
- Probar una vez contra la demo de Nubefact; `find` (consultar comprobante) no se ha probado de verdad.
