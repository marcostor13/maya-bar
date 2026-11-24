# HU70 — Puntaje de leads con IA · cierre

Verificación: autoverificación (el agente spec-verifier está bloqueado por el hook en modo automático).

| Criterio | Estado | Evidencia |
|---|---|---|
| C1 | CUMPLE | `backend/test/lead-scoring.e2e-spec.ts`: el visitante escribe "¿cuánto cuesta? lo necesito esta semana", el puntaje pasa de frío (solo reglas) a ≥ 50 con `scoreReason` "…esta semana" y `scoreDetail.ai = 45`; se mide con la acción `scoring`. Frontend: `score-badge.spec.ts` (motivo en el título) y `leads.spec.ts` "HU70" (insignia, filtro y orden) |
| C2 | CUMPLE | mismo e2e: dos mensajes más y un recálculo manual en menos de 10 min no vuelven a llamar a la IA (`toHaveBeenCalledTimes(1)`), `scoredAt` no cambia y la API responde `skipped: true` |

Extras: la regla de automatización `score_reached` inscribe al contacto al cruzar el umbral; otra empresa recibe 404 al recalcular un contacto ajeno.

## Pruebas
- Backend: unitarias scoring + automatizaciones 7/7; e2e lead-scoring 2/2, app + automations 11/11; build y lint OK.
- Frontend: score-badge, leads y automatizaciones 16/16 + 4/4; `ng build frontend` OK.

## Pendiente del usuario
- Revisar en producción que el puntaje con un modelo real resulte razonable (el prompt está en `score-rules.ts`).
