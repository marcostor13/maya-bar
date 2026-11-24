# HU73 — Agente de IA por voz · cierre

Verificación: autoverificación (spec-verifier bloqueado por el hook en modo automático).

| Criterio | Estado | Evidencia |
|---|---|---|
| C1 [usuario] | CUMPLE en prueba automatizada; falta la llamada real | `test/voice-agent.e2e-spec.ts` "C1": modo fuera de horario → el webhook de llamada entrante hace que el agente conteste (oferta de Meta al proveedor, `pre_accept`/`accept` con la respuesta del modelo), consulta disponibilidad y agenda (`createEvent` del calendario), deja recado, cuelga (`terminate`) y la transcripción queda en el chat. Otro caso: en horario la llamada sigue sonando para el equipo. La llamada real requiere número con Calling API y `OPENAI_API_KEY` |
| C2 | CUMPLE | mismo e2e "C2": llamada de 125 s → un asiento `voice` de 3 minutos = 15 créditos, una sola vez aunque el webhook de fin llegue dos veces; `voice-agent.spec.ts` (minutos empezados y horario de Lima) |

## Pruebas
- Backend: e2e voz 3/3 + llamadas 10/10; unitarias calls, ai-agents y billing 166/166 (+2 nuevas); build y lint OK.
- Frontend: `call-settings.spec.ts` 6/6; `ng build frontend` OK.

## Pendiente del usuario
- Configurar `OPENAI_API_KEY` (y opcional `VOICE_REALTIME_MODEL`) en Coolify.
- Hacer una llamada real fuera de horario a un número con la Calling API activa y comprobar la cita en el calendario (C1) y la latencia.
- Revisar contra la documentación vigente de OpenAI el formato de `/v1/realtime/calls` y del canal de control: está implementado según la API GA, pero no se probó contra el servicio real.
