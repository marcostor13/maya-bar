# HU8 — Mejora de prompts y generador de agentes IA

## Historia

**Como** empresa que atiende con agentes IA,
**quiero** un módulo que analice las conversaciones reales de cada agente y me
proponga mejoras a su prompt, y un generador que me arme un agente nuevo a
partir de unas pocas preguntas sobre mi negocio,
**para** que los agentes respondan mejor con el tiempo y crear uno no exija
saber escribir prompts.

## Alcance pedido

1. **Mejora de prompts según las conversaciones**: revisar las conversaciones
   atendidas por un agente (respuestas erróneas, preguntas sin resolver,
   derivaciones a humano, clientes que abandonan) y sugerir cambios concretos
   al prompt, que el usuario revisa y aplica o descarta.
2. **Generador de agentes IA**: crear un agente (prompt y configuración
   inicial) a partir de datos del negocio y del objetivo del agente.

## Contexto

- Los agentes se gestionan en `frontend/src/app/pages/ai-agents/` (hoy en un
  drawer, ver HU9).
- Supuestos a validar en la spec: comparación antes/después del prompt,
  historial de versiones para revertir, y que nunca se aplique un cambio sin
  aprobación del usuario.
