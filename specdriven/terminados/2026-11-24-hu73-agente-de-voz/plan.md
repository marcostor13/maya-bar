# HU73 · plan
1. Datos: acción `voice` (5 créditos/min); campos del agente de voz en Call; `voiceAgent` en las preferencias de llamada del número.
2. `AiAgentsService.voiceSession`: instrucciones de voz y herramientas (agenda, RAG).
3. Proveedor Realtime (WebRTC + canal de control) detrás de un token.
4. `VoiceAgentService`: decide, toma la llamada, ejecuta herramientas (recado, colgar), cobra y deja la transcripción al cerrar; enganchado en `CallsService.onIncoming`, `expire` y `end`.
5. DTO y validación de ajustes; e2e con proveedor y calendario simulados; unitarias de horario y minutos.
6. Frontend: sección en `call-settings` + spec.
