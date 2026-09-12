# Modelos de IA por proveedor

Qué se puede elegir en **Agentes IA → Avanzado → Modelo**, y con qué criterio.

## Cómo se arma la lista

El selector no trae una lista fija: el backend consulta el catálogo real del
proveedor con la API key del tenant (`GET /ai-agents/models?provider=…`) y
muestra lo que esa cuenta puede usar hoy.

| Proveedor | Endpoint consultado |
| --- | --- |
| Claude | `GET https://api.anthropic.com/v1/models` |
| OpenAI | `GET https://api.openai.com/v1/models` |
| DeepSeek | `GET https://api.deepseek.com/models` |
| Gemini | `GET https://generativelanguage.googleapis.com/v1beta/models` |

Del listado se descarta lo que no sirve para conversar (embeddings, audio,
imagen, moderación, rerank) y se ordenan primero los modelos recomendados de
`backend/src/ai/ai-models.catalog.ts`, que es también el respaldo cuando la
consulta falla (sin key, key inválida o proveedor caído).

Si el agente tiene guardado un modelo que el proveedor ya no sirve, el selector
lo detecta y deja editarlo a mano con la opción **Otro (escribir el id)**.

## Qué modelo conviene para un agente de chat

El agente contesta WhatsApp e Instagram: gana el modelo **rápido y barato**. Los
modelos de razonamiento cuestan varias veces más por mensaje y añaden segundos
de latencia, que en un chat de venta se pagan caro. Sube de gama solo si el
prompt es largo, la base de conocimiento es grande o el agente tiene que decidir
algo complejo.

### Claude (Anthropic)

Precios por millón de tokens (entrada/salida), referencia de 2026:

| Modelo | Contexto | Precio | Cuándo |
| --- | --- | --- | --- |
| `claude-haiku-4-5` | 200K | $1 / $5 | **Recomendado** para chat |
| `claude-sonnet-5` | 1M | $2 / $10 | Prompts largos o mucha base de conocimiento |
| `claude-opus-5` | 1M | $5 / $25 | Casos difíciles, no para volumen |
| `claude-opus-4-8` | 1M | $5 / $25 | Solo si ya tenías prompts afinados con él |

Los ids de Anthropic **no llevan sufijo de fecha**: `claude-haiku-4-5`, no
`claude-haiku-4-5-20251001` (era el id que enviaba la plataforma; ya está
corregido).

### OpenAI

`gpt-5-mini` para chat, `gpt-5` si hace falta más razonamiento; `gpt-4.1-mini` y
`gpt-4o-mini` siguen sirviendo y son más baratos. Dos particularidades que la
plataforma ya maneja:

- En Chat Completions hay que enviar `max_completion_tokens`, no `max_tokens`.
- Los modelos de razonamiento (`gpt-5*`, serie `o*`) **no aceptan `temperature`**
  distinta de 1: el parámetro se omite automáticamente para ellos.

### DeepSeek

`deepseek-chat` para conversar (muy barato, buen español). `deepseek-reasoner`
razona antes de responder: más lento y caro, innecesario para atender chats.

### Gemini (Google)

`gemini-2.5-flash` es la opción sensata; `gemini-2.5-flash-lite` si se busca el
mínimo coste y `gemini-2.5-pro` cuando importa la calidad. El listado en vivo
solo muestra los modelos que soportan `generateContent`.

## Proveedor "Automático"

Usa la primera API key configurada, en este orden: DeepSeek → Claude → OpenAI →
Gemini, con el modelo por defecto de cada uno. En automático no se puede elegir
modelo: para fijarlo hay que elegir proveedor.
