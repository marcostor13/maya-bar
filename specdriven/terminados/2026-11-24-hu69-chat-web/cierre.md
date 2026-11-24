# HU69 — Chat web · cierre

Verificación: autoverificación (el agente spec-verifier está bloqueado por el hook en modo automático).

| Criterio | Estado | Evidencia |
|---|---|---|
| C1 | CUMPLE | `backend/test/webchat.e2e-spec.ts` — "C1": mensaje del widget en `/conversations?channel=web`, respuesta manual recibida por SSE con `got.at - sentAt < 2000`; el historial excluye notas internas |
| C2 | CUMPLE | mismo e2e — "C2": Origin ajeno → 403, sin Origin → 403, `www.` del dominio permitido → 201, chat apagado → 404, preflight CORS refleja el origen |

Extras probados: fusión con contacto existente por email, token alterado → 403, honeypot no guarda nada, aislamiento entre empresas.

## Pruebas
- e2e: webchat 3/3, app 6/6, quotes 5/5.
- Unitarias backend conversaciones + agentes: 344/348; las 4 fallas son `rag.service.spec.ts`, que ya fallaba antes de esta historia (import dinámico sin `--experimental-vm-modules`).
- Frontend: settings, bandeja y contactos 42/42; `ng build frontend` OK. Lint y `npm run build` del backend OK.

## Pendiente del usuario
- Probar el widget pegado en un dominio real (con `PUBLIC_API_URL` correcto en Coolify).
- El hub de SSE vive en memoria: si el backend escala a varias réplicas, hay que pasarlo a Redis pub/sub.
