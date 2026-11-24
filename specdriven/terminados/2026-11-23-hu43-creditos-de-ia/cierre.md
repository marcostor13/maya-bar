# HU43 — Créditos de IA medidos · Cierre

- **Cerrada:** 2026-11-23
- **Estado:** Terminada
- **Verificación (spec-verifier):** 4 CUMPLE → corregidos H1 (textos de evento sin medir), H2 (recuperación sin 402 ni corte), H3 (medios, costo US$, asistentes del agente), H4 (doble cobro al reintentar), H6 (consumo por empresa para superadmin), H7 (pruebas del endpoint), H8 (rama muerta).
- **Commits:** sin commit

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | 1 crédito por respuesta del agente, con tokens y modelo | CUMPLE | `ai.service.metering.spec.ts`, `ai-agents.service.spec.ts` |
| C2 | Con key propia no descuenta | CUMPLE | `ai.service.metering.spec.ts`, `ai-credits.service.spec.ts` |
| C3 | Sin saldo el agente no responde y deriva con "Sin créditos de IA" | CUMPLE | `conversations.email.spec.ts` |
| C4 | Primero el plan, luego recargas; recarga vencida no cuenta | CUMPLE | `ai-credits.service.spec.ts` |

## Qué se implementó

- `usage_ledger` (créditos, recargas usadas, byok, proveedor, modelo, tokens, **costo US$ estimado** con `billing/ai-cost.ts`).
- `AiCreditsService`: saldo, 402 `AI_CREDITS`, descuento plan → recargas, `usageByTenant`.
- Medición central en `AiService` (`meter` con unidades) y tokens reales de Claude, OpenAI, DeepSeek y Gemini.
- Puntos medidos: agente (1), recuperación (3 por conversación, 1 por redacción; se cobra una vez por lote), prospección (10 / 1), plantillas y emails de campaña, todos los textos de evento (incl. `ai-generate` y `ai-design`), generador de agentes y revisión de prompt (1). Medios: anotados a 0 créditos (se leen con keys de la empresa).
- Recuperación: 402 antes de encolar si no hay saldo (sin key propia de DeepSeek); el worker falla a la primera con el aviso.
- `GET /billing/credits` (empresa) y `GET /billing/admin/ai-usage?period=AAAA-MM` (SUPERADMIN).

## Lo que tiene que hacer el usuario

- Revisar las tarifas de `backend/src/billing/ai-cost.ts` cuando cambien los precios de los proveedores (son estimadas).

## Pruebas

- backend `npm test` 134 suites / 1740 OK · e2e `billing` 4/4 OK

## Pendientes, riesgos y notas

- `assertCanSpend` y `record` no son atómicos: con mucha concurrencia el saldo puede pasarse algunas llamadas.
- El chat de prueba del agente gasta créditos (decisión: consume IA real).
- La vista del consumo por empresa la muestra HU57.
