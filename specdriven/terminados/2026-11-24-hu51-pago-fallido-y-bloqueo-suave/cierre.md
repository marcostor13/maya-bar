# HU51 — Pago fallido, gracia y bloqueo suave · Cierre

- **Cerrada:** 2026-11-24
- **Estado:** Terminada
- **Verificación (spec-verifier):** C1 y C2 CUMPLE, C3 PARCIAL. Hallazgos corregidos:
  1. **Cobro doble:** al pagar con una suscripción nueva, la anterior queda en `preapprovalsToCancel`. Un cron (cada 10 min) la cancela en Mercado Pago. Un cobro aprobado de una suscripción reemplazada se registra en el log para revisar el reembolso.
  2. **Volver a solo lectura habiendo pagado:** con una suscripción nueva, el periodo empieza hoy y no al fin viejo.
  3. **Intento de compra que llega tarde:** ya no se confunde con un cobro mensual; se compara su `date_created` con `fulfilledAt`.
  4. **Carrera en `markPastDue`:** el `updateMany` repite el corte de fechas.
  5. **Exportar conversaciones:** nuevo `GET /conversations/export.csv`, solo para el administrador y protegido contra fórmulas de Excel. Además, un botón "Exportar conversaciones" en el banner en solo lectura.
  6. **Aviso de 60 días:** también para planes cancelados ya terminados; se marca `longExpiredNoticeAt` para no ocupar el lote. Las pruebas que nunca pagaron no se avisan.
  10. **Banner:** fondo rojo suave y `role="alert"`.
  - **Pruebas nuevas:**
    - 402 al enviar un mensaje en solo lectura.
    - Exportación de las conversaciones.
    - Compra que llega tarde.
    - Suscripción nueva que cancela la anterior.
    - `markPastDue` con aviso del día 0.
- **Commits:** sin commit

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | En `past_due` se escribe; en `expired`, `POST` de envío da 402 y la exportación funciona | CUMPLE | `backend/test/past-due.e2e-spec.ts` |
| C2 | En `expired` un WhatsApp entrante se guarda en la bandeja | CUMPLE | ídem |
| C3 | Pagar en `expired` deja la cuenta `active` y el agente vuelve a operar | CUMPLE | ídem (cobro recurrente y suscripción nueva) |

## Pendientes, riesgos y notas

- **Al pagar** (hallazgo 7): los mensajes programados y los reintentos aplazados vuelven en su siguiente ciclo, hasta 1 h después.
- **Avisos de los días 3 y 6:** usan un motivo genérico.
- **Varias réplicas:** la caché de acceso tarda hasta 30 s en reactivarse en las demás.
- **Cobro de una suscripción ya reemplazada** (antes de que se cancele): solo se registra en el log; el reembolso es manual.
