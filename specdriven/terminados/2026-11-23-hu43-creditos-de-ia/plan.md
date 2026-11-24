# HU43 — Créditos de IA medidos · Plan técnico

## Estado actual

- Llamadas a modelos por `backend/src/ai/ai.service.ts` (`chat`, `chatMessages`) y `providers/http-ai.provider.ts`; sin registro de consumo.

## Diseño

- **Datos**: `usage_ledger` (`billing/usage-ledger.schema.ts`); `Tenant.aiCreditsPurchased` y `aiCreditsPurchasedExpiresAt`.
- **Servicio**: `AiCreditsService` (`balance`, `assertCanSpend`, `record` con unidades; descuenta recargas solo tras agotar el plan).
- **Medición central**: `AiService.metered` con `meter: { tenantId, action, units? }`; el proveedor informa tokens por `onUsage`; BYOK = key de la empresa para el proveedor resuelto.
- **Puntos medidos**: agente (`ai-agents.service.ts`), recuperación (clasificación ×3 por conversación, redacción ×1), prospección (investigación ×10, búsquedas ×1), plantillas de email, campañas y eventos (×1).
- **Agente sin créditos**: `ConversationsService.runAgent` captura `AiCreditsException` → `escalateToHuman(..., 'Sin créditos de IA')`.
- **API**: `GET /billing/credits`.

## Seguridad

Saldo y consumo por `tenantId` del JWT o del recurso; el modelo no controla el medidor.

## Observabilidad

Registro por llamada con tokens y modelo; fallos al anotar solo van al log.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Medir rompe la respuesta | `record` captura sus errores |
| Carrera en recargas | `$inc` atómico; el desfase máximo es una llamada |

## Estrategia de pruebas

- Unitarias: `ai.service.metering.spec.ts`, `ai-credits.service.spec.ts`, `conversations.email.spec.ts` (C3), `ai-agents.service.spec.ts` (C1).

## Fases

1. Todo en una entrega.
