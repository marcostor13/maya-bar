# HU73 — Agente de IA por voz · spec

## Alcance
- **Proveedor**: OpenAI Realtime por WebRTC (`src/voice/realtime-provider.ts`). La oferta SDP de la llamada de WhatsApp se le entrega a OpenAI (`POST /v1/realtime/calls`) y su respuesta SDP vuelve a Meta con `pre_accept` + `accept`: el audio va directo Meta ↔ OpenAI, sin pasar por el servidor (latencia de voz a voz nativa del modelo, sin cadena STT→LLM→TTS). El servidor escucha el canal de control (WebSocket con `call_id`) para herramientas y transcripción. El proveedor se inyecta por token (`VOICE_REALTIME_PROVIDER`) para simularlo en pruebas.
- **Cuándo contesta** (por número de WhatsApp, `calling.voiceAgent`): `fallback` (nadie contesta en el tiempo de timbre), `outside_hours` (al instante fuera del horario humano, hora de Lima, días configurables) o `always`. Reserva atómica `ringing → connecting`: si un humano la toma en el mismo instante, gana el humano. Sin saldo, sin agente publicado o si falla el proveedor, la llamada sigue su curso normal.
- **El agente**: las instrucciones del mismo agente de IA + reglas de voz; herramientas `consultar_disponibilidad` / `agendar_cita` (HU1), `buscar_informacion` (RAG), `dejar_recado` (nota en el chat + push al equipo) y `colgar`.
- **Grabación con aviso**: opción "avisar que se transcribe". Se guarda la transcripción en la llamada y en el chat del contacto, y un resumen corto (`voiceSummary`). No se graba el audio (el audio no pasa por el servidor).
- **Cobro**: acción de créditos `voice` = 5 por minuto; cada minuto empezado cuenta; se cobra una sola vez al terminar (`voiceBilled`).
- **UI**: sección "Agente de IA por voz" en los ajustes de llamadas del número (agente publicado, cuándo contesta, horario, aviso; muestra el costo por minuto y si el servicio no está configurado).

## Criterios
- C1 [usuario]: llamada real fuera de horario atendida por el agente que agenda una cita visible en el calendario.
- C2: cada minuto de llamada descuenta los créditos configurados.

## Fuera de alcance
- Transferir en vivo la llamada a un humano (la Calling API no transfiere): se deja recado y se avisa al equipo.
- Grabación del audio; otros proveedores de voz.
