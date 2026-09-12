# Análisis de las conversaciones del agente de IA

Cómo medir lo que el agente está haciendo en producción, qué es una conversación
de venta efectiva en este negocio, y qué hay que cambiar en el prompt y en la
plataforma para que cierre más reservas.

> **Estado de los datos.** El reporte con números reales no está incluido aquí:
> esta sesión no tiene acceso a la base de producción (no hay `MONGODB_URI`
> disponible). Lo que sí está listo es la herramienta que lo genera
> (`backend/scripts/analyze-conversations.js`) y la auditoría del agente hecha
> sobre el código y el prompt actual, que no dependen de los datos.

---

## 1. Cómo generar el reporte

```bash
cd backend
MONGODB_URI="mongodb://..." npm run analyze:conversations -- --days 30

# una cuenta concreta: resuelve el tenant a partir del email del usuario
npm run analyze:conversations -- --user admin@ignia.site --days 30

# un agente concreto de esa cuenta (por nombre o por id)
npm run analyze:conversations -- --user admin@ignia.site --agent "Ventas" --vertical generico

# otras variantes
npm run analyze:conversations -- --days 7 --tenant <tenantId>
npm run analyze:conversations -- --channel whatsapp --out ../docs/reporte-septiembre.md
npm run analyze:conversations -- --transcripts /tmp/chats.jsonl     # chats completos para leer
npm run analyze:conversations -- --llm --sample 25                  # + rúbrica de ventas puntuada por IA
npm run analyze:conversations -- --demo                             # prueba en seco, sin Mongo
```

| Flag | Para qué |
| --- | --- |
| `--user <email>` | resuelve el tenant desde `users.email`; es la forma cómoda de apuntar a una cuenta |
| `--agent <nombre\|id>` | limita el análisis a las conversaciones de ese agente y agrega su ficha + prompt actual al reporte |
| `--vertical reservas\|generico` | qué embudo usar (ver abajo). Por defecto `reservas` |
| `--days`, `--channel`, `--limit` | ventana, canal y tope de conversaciones |
| `--llm --sample N` | puntúa N chats con la rúbrica de venta |
| `--transcripts <archivo>` | vuelca los chats completos en JSONL para leerlos |

**Verticales del embudo.** `reservas` es el negocio de discotecas (local → box/mesa
→ intención → datos → confirmada). `generico` sirve para cualquier agente de venta
consultiva: contacto → necesidad expuesta → propuesta entregada → intención →
datos capturados → cierre/agenda. Elegir mal la vertical no rompe nada, pero el
embudo queda plano.

El script escribe `docs/reporte-conversaciones.md` con:

| Sección | Qué responde |
| --- | --- |
| Resumen | volumen, canal, tiempo de primera respuesta, % confirmadas, % escaladas, rebotes |
| Embudo | cuántas conversaciones llegan a cada etapa y **entre qué dos etapas se pierde la venta** |
| Calidad de mensajes | largo medio, muros de texto, emojis, % de mensajes que terminan preguntando, respuestas repetidas, veces que cayó en el fallback |
| Qué pregunta la gente | ranking de temas (precio, box, mesa, lista, cumpleaños, ubicación, dress code…) |
| Derivaciones | motivos de handoff más frecuentes |
| Horarios | a qué hora entran los chats (define cuándo hace falta un humano de guardia) |
| Rúbrica IA (`--llm`) | puntuación 1–5 por dimensión de venta, errores repetidos y mejoras de prompt sugeridas por el propio modelo |
| Para revisar a mano | los chats que más cerca estuvieron de cerrar y no cerraron, y los que sí cerraron (sirven de *few-shot*) |

Las etapas del embudo se infieren del texto (nombres de locales tomados de la
colección `locals`, patrones de precio, intención de reserva, teléfono +
fecha + nombre, frase de confirmación). Son heurísticas: sirven para ver
tendencias y comparar semanas, no como contabilidad exacta.

**Cadencia sugerida:** correrlo semanal con `--days 7` y guardar el markdown.
La métrica que manda es la caída `info_entregada → intencion_reserva`.

---

## 2. Cómo debe ser una conversación de venta efectiva en este negocio

El canal es WhatsApp/DM, el cliente decide en minutos y compara con otras
discotecas en paralelo. La conversación efectiva tiene esta forma:

**1. Velocidad antes que perfección.** Responder en menos de 60 segundos, siempre.
Un chat de discoteca que se responde a los 10 minutos ya compró en otro lado.

**2. Apertura que califica, no que informa.** El error clásico es volcar el
catálogo completo ante un "hola, precios?". La apertura correcta devuelve **una**
pregunta que segmenta: *¿para qué local?* o *¿para qué fecha y cuántos son?*

**3. Calificación antes de cotizar** (cinco datos, uno por mensaje):
local · fecha · cantidad de personas · ocasión (cumpleaños, despedida, salida) ·
rango de gasto. Sin esto el agente cotiza a ciegas y el precio suena caro porque
no está anclado a nada.

**4. Recomendación, no lista de precios.** Máximo dos opciones, la más alta
primero (anclaje) y la alternativa después. El precio va siempre pegado a lo que
incluye: *"S/900 con derecho a 2 botellas de S/450 — para 10 personas son S/90
cada uno con trago incluido"*. Dividir el total entre los asistentes es la
herramienta más efectiva contra la objeción de precio en este rubro.

**5. Objeciones sin improvisar.** "Está caro" se responde bajando el tamaño del
ticket (mesa en vez de box, lista free antes de las 11), nunca inventando
descuentos ni prometiendo cortesías que no están en la base. Si el cliente pide
algo que no está en la base: derivar, no improvisar.

**6. Micro-compromiso antes de pedir datos.** *"¿Te aparto el box para el
sábado?"* Un sí explícito antes de la ficha de datos; pedir los cinco campos a
alguien que todavía no dijo que sí es donde más gente se cae.

**7. Captura progresiva y sin repetir lo que ya se sabe.** En WhatsApp el
teléfono ya lo tenemos; pedirlo otra vez quema al cliente. Pedir de a uno o dos
datos, confirmando lo que ya se dio.

**8. Cierre con el siguiente paso concreto.** No basta "reserva confirmada":
tiene que decir qué pasa ahora — dirección, hora límite de llegada, si hay
prepago y cómo, a qué nombre está la reserva.

**9. Sin callejones sin salida.** Todo mensaje del agente termina en pregunta o
en llamado a la acción. Si no sabe algo, no cierra con "no tengo esa
información": ofrece derivar a una persona.

**10. Seguimiento.** El chat que se enfría después de la cotización es el mayor
volumen de venta perdida. Reengancharlo a las 2 h y al día siguiente
("¿te separo el box para el sábado? quedan pocos") recupera una parte sin costo.

**11. Handoff con contexto.** Cuando deriva, el humano tiene que recibir local,
fecha, personas y qué se cotizó, no solo "el cliente quiere hablar".

Estas once conductas son exactamente las dimensiones que puntúa la rúbrica de
`--llm`, así que el reporte mide lo mismo que dice esta sección.

---

## 3. Auditoría del agente actual

Hallazgos verificables en el código y en `docs/PROMPT_AGENTE_RESERVAS.md`,
ordenados por impacto en ventas.

> **Alcance.** Los hallazgos de la plataforma (A, B, D, E, F, I, J) son del motor
> de agentes y afectan a **todos** los agentes de todos los tenants. Los
> hallazgos C y G y las sugerencias de la sección 4 están escritos sobre el
> prompt de reservas de Grupo Solar; para el agente de otra cuenta hay que releer
> su propio prompt (sale en la ficha del reporte con `--agent`).

### 3.1. Bloqueantes de negocio

**A. La reserva no queda registrada en ninguna parte.**
`generateAnswer()` (`backend/src/ai-agents/ai-agents.service.ts:356`) solo sabe
producir texto y dos tokens: `{{HANDOFF}}` y `{{SEND_FILE}}`. No existe ningún
camino que cree un documento en `reservations` ni un lead. El agente dice "tu
reserva está confirmada" y en el sistema no hay nada: alguien tiene que leer el
chat a mano. Es la fuga más grande del embudo.
→ Agregar un token `{{RESERVA:local|fecha|hora|personas|nombre}}` parseado igual
que `{{HANDOFF}}`, que cree la reserva (o al menos un lead) y confirme solo si la
creación salió bien.

**B. El agente no sabe qué día es hoy.**
El *system prompt* se arma con `agent.systemPrompt` + base de conocimiento +
archivos + handoff. **No se inyecta la fecha/hora actual** ni la zona horaria.
Con eso, "el sábado", "mañana" o "hoy" son ambiguos y el agente no puede validar
que la fecha pedida sea futura.
→ Inyectar siempre un bloque `--- CONTEXTO ---` con fecha y hora de Lima, canal,
nombre del contacto y teléfono ya conocido.

**C. Confirma sin comprobar disponibilidad.**
El prompt dice "no garantices disponibilidad" (Regla 5.4) y tres pasos después
manda cerrar con "Tu reserva está confirmada" (Paso 5). El agente no tiene forma
de consultar cupo. Resultado: promesas que el local no puede sostener.
→ Mientras no haya consulta de cupo real: "queda registrada y el equipo te
confirma el cupo", y derivar para confirmar.

### 3.2. Defectos de conversación

**D. Sin agrupado de mensajes (*debounce*).**
Cada mensaje entrante dispara una respuesta
(`backend/src/conversations/conversations.service.ts:981`). El cliente que
escribe "hola" / "tienen box?" / "para el sábado" en tres mensajes recibe tres
respuestas, y la primera contesta sin conocer la intención.
→ Esperar 6–10 s de silencio y responder una sola vez a todo el bloque.

**E. Memoria corta.**
`HISTORY_LIMIT = 10` en `ai-agents.service.ts:23` (aunque se traigan 20 mensajes
en `conversations.service.ts:42`). Con mensajes fragmentados, 10 turnos son 3 o 4
intercambios: el agente olvida el local elegido o la fecha justo cuando está
pidiendo los datos, y vuelve a preguntar lo mismo.
→ Subir a 24–30 turnos, o resumir lo ya acordado en el contexto.

**F. El fallback es un callejón sin salida.**
`fallbackMessage` por defecto: *"Lo siento, no tengo esa información en este
momento."* Sin pregunta, sin derivación. Cada vez que aparece, la conversación
muere. Además la instrucción de RAG ("usa EXCLUSIVAMENTE la base… si no está
dilo claramente") empuja al modelo a usarlo también para cosas que no son datos
duros.
→ Separar en el prompt **datos duros** (precio, dirección, promo, horario: solo
de la base) de **conversación** (saludar, recomendar, insistir amablemente,
cerrar: libre), y cambiar el fallback por uno que ofrezca derivar.

**G. Contradicción interna del prompt.**
Regla 6 dice "una sola pregunta a la vez"; el Paso 4 pide los cinco datos de
golpe en un bloque. El modelo resuelve la contradicción de forma inconsistente.

**H. `maxTokens: 800` por defecto** permite respuestas de 3.000 caracteres. Para
WhatsApp/DM el techo útil está en ~300 tokens, y el prompt debería decir
explícitamente el largo máximo en líneas.

**I. Los mensajes de sistema entran como turnos del asistente.**
`toAiContent()` mapea por `direction`, así que notas internas y eventos de
sistema salientes se le presentan al modelo como si los hubiera dicho él.
→ Filtrar `author === 'system'` al armar el historial.

**J. No hay seguimiento automático.** Nada reengancha al que se enfrió. El módulo
de campañas ya existe y podría dispararse sobre conversaciones en etapa
`info_entregada` sin actividad en 2 h / 24 h.

---

## 4. Sugerencias concretas para el prompt

Prioridad alta (cambian la tasa de cierre):

1. **Calificar antes de cotizar.** Prohibir volcar el catálogo ante un "hola" o
   "precios?": primero local, fecha y cantidad de personas, una pregunta por
   mensaje.
2. **Precio siempre con valor y dividido por persona.** Nunca el número solo.
3. **Micro-compromiso antes de la ficha de datos** ("¿te lo aparto?"), y pedir
   los datos de a uno o dos, no los cinco juntos — resolviendo la contradicción G.
4. **Prohibir el callejón sin salida:** todo mensaje termina en pregunta o CTA;
   si no sabe algo, deriva en vez de decir "no tengo esa información".
5. **No confirmar lo que no se puede confirmar:** el texto de cierre pasa a
   "queda registrada, el equipo te confirma el cupo" hasta que exista consulta de
   disponibilidad real.
6. **Manejo explícito de la objeción de precio** con las tres salidas
   permitidas: dividir el total, ofrecer el tramo menor (mesa / lista free),
   o derivar. Nunca inventar descuentos.

Prioridad media (calidad y confianza):

7. **Formato duro:** máximo 5 líneas y ~400 caracteres por mensaje, 1–3 emojis,
   sin markdown pesado en Instagram.
8. **Separar datos duros de conversación** (hallazgo F) para que el RAG no apague
   la habilidad de vender.
9. **Reglas de fecha y horario** apoyadas en el bloque de contexto inyectado:
   rechazar fechas pasadas, resolver "hoy/mañana/el sábado" contra la fecha real.
10. **No repreguntar lo que ya se dijo**, y recapitular antes de cerrar
    ("Elephant, sábado 13, 4 personas, box — ¿confirmo así?").
11. **Handoff con contexto**: el motivo debe incluir local, fecha, personas y qué
    se cotizó.

En `docs/PROMPT_AGENTE_RESERVAS_V2.md` está el prompt completo reescrito con
todos estos puntos, listo para pegar en el agente.

---

## 5. Cambios de plataforma que acompañan al prompt

Ordenados por relación impacto/esfuerzo. No están implementados.

| # | Cambio | Dónde | Impacto |
| --- | --- | --- | --- |
| 1 | Token `{{RESERVA:...}}` que crea la reserva/lead | `ai-agents.service.ts` (junto a `parseHandoffToken`) | Alto |
| 2 | Inyectar contexto (fecha/hora Lima, canal, nombre, teléfono) en el system prompt | `generateAnswer()` | Alto |
| 3 | *Debounce* de 6–10 s de los mensajes entrantes | `conversations.service.ts` | Alto |
| 4 | Subir `HISTORY_LIMIT` a 24–30 y filtrar `author: 'system'` | `ai-agents.service.ts:23`, `buildAiHistory()` | Medio |
| 5 | Seguimiento automático a las 2 h / 24 h del chat frío | módulo `campaigns` | Alto |
| 6 | Consulta de disponibilidad real antes de confirmar | `reservations` | Medio |
| 7 | Guardar el contacto en el CRM automáticamente al capturar nombre + teléfono | `conversations.service.ts:498` (`saveContact`) | Medio |

---

## 6. Qué mirar en el reporte una vez generado

- **`info_entregada → intencion_reserva`**: si ahí se cae más del 60 %, el
  problema es la falta de calificación y de micro-compromiso (puntos 1–3).
- **% de mensajes que terminan preguntando < 70 %**: el agente está informando,
  no vendiendo (punto 4).
- **Fallbacks altos**: la base de conocimiento tiene huecos o el RAG está
  apagando la conversación (hallazgo F).
- **Mediana de primera respuesta > 60 s**: problema de infraestructura, no de
  prompt.
- **Escaladas altas por "disponibilidad"**: justifica el punto 6 de plataforma.
- **Chats que el agente nunca contestó**: cuentas sin agente publicado o
  conversaciones en modo manual olvidadas.
