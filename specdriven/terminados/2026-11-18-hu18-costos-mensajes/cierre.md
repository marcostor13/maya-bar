# HU18 — Costos de los mensajes en el dashboard · Cierre

- **Cerrada:** 2026-11-18
- **Estado:** Terminada (pendiente prueba real: el dato de cobro llega de Meta con los estados de envíos reales)
- **Verificación (spec-verifier):** 6 CUMPLE · 0 PARCIAL · 0 NO CUMPLE
- **Commits:** sin commit
- **Verificación mecánica:** completa antes de las correcciones finales (backend 1646/1646, e2e 103/103, frontend 793/793, builds OK). Tras las correcciones se corrieron las suites afectadas (202 unitarias, 16 e2e, dashboard 8/8); la corrida completa final se interrumpió por falta de memoria del sistema y queda pendiente.
- **Fuente de tarifas:** `docs/costos-mensajes.md` (WhatsApp vigente desde 1-oct-2026; revisar en enero de 2027)

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Estado | Evidencia |
|---|---|---|
| C1 mercado por prefijo y precio | CUMPLE | `message-pricing.ts`; unitaria |
| C2 `pricing` del ack | CUMPLE | `handleAck`; e2e con webhook firmado |
| C3 costos del periodo, aislado | CUMPLE | `DashboardCostsService`; e2e |
| C4 sin tarifa / tarifas guardadas | CUMPLE | e2e (400 fuera de rango, cálculo tras guardar) |
| C5 solo TENANT_ADMIN | CUMPLE | e2e 403 |
| C6 tarjeta | CUMPLE | `message-costs-card.spec.ts` |

## Correcciones tras la verificación

- Un PUT con una sola tarifa ya no borra la otra (`null` la quita, ausente la conserva). Tiene prueba.
- Un mensaje de WhatsApp fallido no cuenta como cobrado.
- Enlaces a todas las fuentes (WhatsApp, segmentos SMS, Resend, Messenger/Instagram).
- `docs/costos-mensajes.md` indica dónde se configuran las tarifas.
- Un solo contador de segmentos SMS (`shared/sms-segments`).

## Riesgos aceptados

- No incluye escalones de volumen de Meta ni los SMS y correos de la derivación del agente.
- Segmentos de SMS de campañas estimados con el texto base (las variables pueden añadir un segmento).
- Los mensajes de cuentas que no usan la API oficial de Meta quedan «sin dato de cobro».
- Mensajes enviados antes de esta versión no tienen dato de cobro.

## Lo que tiene que hacer el usuario

- Tras el deploy, enviar mensajes reales por WhatsApp (Cloud API) y revisar la tarjeta; configurar las tarifas de SMS y correo en «Tarifas».
