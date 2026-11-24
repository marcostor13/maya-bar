# HU73 — Agente de IA por voz

## Historia

**Como** clínica o empresa de servicios,
**quiero** que el agente de IA conteste llamadas de WhatsApp, agende citas y derive a un humano,
**para** no perder llamadas fuera de horario.

## Contexto (estado actual)

- Ya existen:
  - Llamadas de WhatsApp por WebRTC (HU6).
  - Agentes de IA con RAG y herramientas: agenda (HU1) y tienda.
  - Transcripción de notas de voz.
- No hay voz en tiempo real (no se encontró `realtime` ni TTS).

## Propuesta

1. Si nadie contesta una llamada entrante en N segundos (o fuera de horario), la toma el agente de voz:
   - Voz a texto en streaming → el mismo agente con sus herramientas → texto a voz.
   - Latencia objetivo por debajo de 1,5 s.
2. Puede agendar (HU1), responder con la base de conocimiento y derivar: transferir al humano o dejar un recado con un resumen en la conversación.
3. Grabación opcional con aviso, más la transcripción y el resumen guardados en el contacto.
4. Add-on de alto margen: se cobra por minuto en créditos (por ejemplo, 5 créditos por minuto).

## Criterios de aceptación (borrador)

- C1 **[usuario]**: una llamada real fuera de horario la atiende el agente y agenda una cita visible en el calendario.
- C2: cada minuto de llamada descuenta los créditos configurados.
