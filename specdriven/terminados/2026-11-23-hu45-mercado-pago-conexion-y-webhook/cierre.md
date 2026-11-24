# HU45 — Conexión con Mercado Pago y webhook seguro · Cierre

- **Cerrada:** 2026-11-23
- **Estado:** Terminada
- **Verificación (spec-verifier):** 4 CUMPLE → corregidos: procesamiento concurrente del mismo evento (candado atómico `processing` + `lockedUntil`), `syncFromMp` atómico (un solo aviso por cambio), recurso procesado = recurso firmado, idempotencia obligatoria al crear, conciliación limitada a 7 días y ordenada; pruebas de los tres tipos de evento y del cliente.
- **Commits:** sin commit

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Firma alterada → 401 y nada cambia | CUMPLE | `mp-signature.spec.ts`, `backend/test/mercadopago.e2e-spec.ts` |
| C2 | Mismo evento dos veces → una vez (también en paralelo) | CUMPLE | e2e |
| C3 | Se usa el estado de la API, no el del cuerpo | CUMPLE | e2e |
| C4 | Pago aprobado sin webhook se concilia | CUMPLE | e2e |

## Qué se implementó

- `MercadoPagoClient` (timeout, reintentos en red/5xx, idempotencia), firma `x-signature`, `POST /billing/webhooks/mercadopago`.
- `billing_events` con índice único, candado atómico y reintentos cada minuto (máx. 6).
- `PaymentsService.syncFromMp` atómico + conciliación horaria; `BillingHooks` para HU46–HU50.
- Pruebas: `mp-signature.spec.ts`, `mercadopago.client.spec.ts`, `mercadopago.e2e-spec.ts`.

## Lo que tiene que hacer el usuario

- Seguir `docs/cobros-mercadopago.md`: crear la aplicación en Mercado Pago Perú, configurar el webhook (pagos, suscripciones, pagos de suscripciones) y pegar `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY` y `MP_WEBHOOK_SECRET` en Coolify.

## Pendientes, riesgos y notas

- No se rechaza un `ts` antiguo en la firma (Mercado Pago reintenta notificaciones); el daño está acotado porque siempre se reconsulta la API.
- Eventos que agotan los 6 intentos quedan en `failed` con log; la vista para el superadmin llega con HU57.
- Si falta `body.id`, el id de respaldo es `tipo:recurso:acción`.
