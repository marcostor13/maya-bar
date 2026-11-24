# HU43 — Créditos de IA medidos

## Historia

**Como** dueño de Maya,
**quiero** medir en créditos todo lo que gasta IA cada empresa,
**para** proteger el margen y vender recargas.

## Contexto (estado actual)

- Las llamadas a modelos pasan por `AiService` y `HttpAiProvider` (`backend/src/ai/`): Claude, OpenAI, Gemini y DeepSeek. También hay transcripción y lectura de medios (`media-understanding.service.ts`), RAG y embeddings (`ai-agents`), recuperación (`recovery`) y prospección (`prospecting`).
- No se guarda el consumo por empresa. Cada empresa puede poner sus propias API keys.

## Propuesta

1. Tabla de créditos:

   | Acción | Créditos |
   |---|---|
   | Respuesta de agente (texto) | 1 |
   | Voz, imagen, video o PDF interpretado | 2 |
   | Conversación analizada en recuperación | 3 |
   | Empresa investigada en prospección | 10 |
   | Texto generado (campaña o evento) | 1 |

2. Colección `usage_ledger`:
   - Campos: `tenantId`, `periodo AAAA-MM`, `acción`, `créditos`, `tokens in/out`, `modelo` y `costo US$ estimado`.
   - Contador agregado por mes.
3. El saldo del mes se calcula así: los créditos del plan más las recargas (HU53), menos lo consumido. Los créditos del plan no se acumulan de un mes a otro; las recargas duran 12 meses.
4. **Con las API keys propias de la empresa no se descuentan créditos**, pero el consumo sí se registra.
5. Saldo agotado:
   - El agente deriva a un humano con un aviso interno, en vez de quedarse callado.
   - Las funciones que gastan créditos responden 402 `AI_CREDITS`.
   - Avisos al 80 % y al 100 % (HU50).

## Criterios de aceptación (borrador)

- C1: cada respuesta del agente deja un registro de 1 crédito con los tokens y el modelo.
- C2: con las keys propias no se descuenta saldo.
- C3: sin saldo, el agente no responde y la conversación queda asignada a un humano con la nota "Sin créditos de IA".
