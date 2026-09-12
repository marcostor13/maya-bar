# Análisis del agente de IA — Maya Classroom (IGNIA)

Estudio de la cuenta `admin@ignia.site` sobre **74 conversaciones y 514 mensajes**
reales (240 del cliente, 157 del agente, 117 de una persona del equipo).
Datos extraídos de producción el 2026-09-11.

---

## 1. El veredicto en cinco números

| Métrica | Valor | Qué significa |
|---|---|---|
| Longitud mediana del agente | **528 caracteres** | |
| Longitud mediana del cliente | **27 caracteres** | El agente escribe **20 veces más** que su interlocutor |
| Conversaciones rescatadas por un humano | **52 de 74 (70 %)** | Y entra de mediana **en el segundo mensaje** |
| Conversaciones muertas en ≤4 mensajes | **46 de 74 (62 %)** | La conversación no llega a empezar |
| Conversaciones cerradas | **0** | |

El agente no está vendiendo: está **repartiendo folletos**. Y una persona del
equipo tiene que entrar detrás, casi siempre, a hacer lo que el agente no hizo.

---

## 2. El diagnóstico que lo explica todo

El prompt actual **mide 45 130 caracteres (~11 000 tokens)** y el agente corre
sobre **`gpt-4o-mini`** — el campo `aiModel` está vacío, así que cae al modelo por
defecto en `ai.service.ts:90`.

Esto es lo importante: **el prompt no está mal escrito**. Está bien escrito. Tiene
metodología de 10 pasos, manejo de objeciones, límites explícitos contra inventar
funciones o dar descuentos, y una sección entera titulada *"LA DEMOSTRACIÓN (tu
herramienta más fuerte)"*. Las reglas correctas **ya están ahí**.

El problema es que un modelo pequeño con 11 000 tokens de instrucciones
**obedece el principio y el final, y pierde el centro**. Y justo en el centro
están las reglas que más importan: calificar antes de informar, mensajes cortos,
una idea por mensaje.

> Se nota en los datos: el prompt prohíbe el monólogo, y el agente monologuea.
> Prohíbe soltar catálogo sin preguntar, y suelta catálogo. No es desobediencia:
> es que esas líneas nunca llegan a pesar en la decisión del modelo.

**Corolario:** reescribir el prompt sin tocar el modelo ni la longitud no va a
arreglarlo. Hay que hacer las tres cosas.

---

## 3. Los siete fallos, con su evidencia

### 3.1 Nunca califica — informa a ciegas

| Conducta del agente | Veces |
|---|---|
| Preguntas sobre el negocio del cliente | **7** |
| Ofertas pasivas de "más información" | **34** |

La frase que más repite una persona del equipo al entrar es:

> *"Hola buenos días, ¿qué tipo de negocio tiene?, para poder ayudarle"* — **11 veces**

El humano entra a hacer **la primera pregunta de calificación**, que el agente
debió hacer en su primer mensaje. Vender un aula virtual a una academia de
pastelería y a una empresa que capacita a su personal no es la misma
conversación, y el agente las trata igual.

### 3.2 Monologa

528 caracteres de mediana, con picos de **1 520**. En WhatsApp eso es una pared
de texto que se lee en diagonal o no se lee. El cliente responde con 27
caracteres: está en modo chat, el agente en modo folleto.

`maxTokens: 800` es permiso explícito para esto.

### 3.3 Repite bloques enlatados

| Bloque | Repeticiones |
|---|---|
| *"Aulas virtuales propias: montamos la tuya con tu marca y en…"* | **30** |
| *"Hola, ¿cómo estás? Soy Marcos, de Maya Classroom 👋 Te mando…"* | **22** |
| *"Te montamos tu propia aula virtual, con tu marca y en tu dom…"* | **9** |

Treinta personas distintas recibieron el mismo párrafo. No hay adaptación al
caso de nadie.

### 3.4 Cierra en falso — 92 finales pasivos

| Muletilla | Veces |
|---|---|
| *"dímelo / házmelo saber / pregúntame"* | 14 |
| *"¿Te gustaría saber más…?"* | 10 |
| *"Si quieres más detalles…"* | 10 |

Solo **65 de 157** mensajes del agente contienen una pregunta. Los otros 92
terminan en punto muerto: dejan el trabajo de continuar en manos del cliente.
Y el cliente, 23 veces de 74, simplemente no vuelve a escribir.

### 3.5 Escribe en un formato que WhatsApp no entiende

**40 mensajes** usan `**negrita**` de Markdown. WhatsApp usa `*asterisco simple*`.
El cliente ve literalmente:

> `**Implementación: S/ 347**, pago único.`

Con los asteriscos a la vista. Además **27 mensajes** llevan listas numeradas o
con guiones: formato de documento, no de conversación.

Esto es un defecto visible en el producto, y se arregla con una línea de prompt.

### 3.6 La demo se manda, pero se ahoga

El agente sí manda el enlace (74 veces) — pero **una persona tuvo que volver a
mandarlo 29 veces**. Siempre por lo mismo: iba enterrado al final de un párrafo
de 500 caracteres, junto al precio y a la lista de funciones. Nadie hace clic en
un enlace que llega dentro de un muro.

La demo es el activo más fuerte que tienen —un aula real, sin usuario ni
contraseña— y está desperdiciada.

### 3.7 La derivación a humano está apagada

`handoffEnabled: false`. El prompt tiene una sección *"CUÁNDO PASAS A UN HUMANO"*
que **no puede ejecutarse**. Por eso las 52 intervenciones son manuales: alguien
vigilando la bandeja. Ese es el coste real que paga IGNIA hoy.

---

## 4. Cómo debe ser una conversación de ventas potente

Antes del prompt, el criterio. Una conversación que vende por WhatsApp cumple
cinco cosas, y ninguna es "dar más información".

### Regla 1 — El que pregunta, manda

Quien hace las preguntas dirige. Si el agente solo responde, el cliente dirige la
conversación hacia "mándame precios" y se va a comparar. **Cada mensaje del agente
termina en una pregunta** que hace avanzar, no en un "cualquier cosa me dices".

### Regla 2 — Diagnóstico antes que receta

Un médico que receta antes de preguntar dónde duele es un charlatán. El orden es:
qué enseña → a cuántos → cómo lo hace hoy → qué le duele de eso. Solo entonces la
solución se presenta **con su caso dentro**: no "tenemos certificados
verificables", sino "tus 80 alumnos de repostería reciben su certificado con tu
logo y un código que la empresa que los contrata puede verificar".

### Regla 3 — Una idea por mensaje

En chat se conversa, no se expone. Un mensaje = una idea = **máximo 2 o 3 líneas**.
Si hay tres cosas que decir, son tres mensajes cortos o —mejor— una y luego una
pregunta. La longitud del agente debe parecerse a la del cliente.

### Regla 4 — Mostrar gana a describir

Describir una plataforma es débil. Enseñarla es fuerte. La demo va **sola, en su
propio mensaje, pronto, y con una instrucción de un renglón**:

> *Mira esta aula funcionando de verdad: https://mayaclassroom.ignia.site/auth/login*
> *No necesitas usuario ni contraseña, entras directo.*

Y después —esto es lo que el equipo hace bien a mano— **se pregunta si entró**.
"¿Pudiste entrar?" reabre la conversación y da permiso a objetar.

### Regla 5 — Pedir la venta

Ninguna venta se cierra sola. Tras resolver la objeción hay que pedirla, con una
pregunta cerrada y concreta: *"¿Arrancamos esta semana?"*, no *"¿te gustaría saber
más de los planes?"*. Y si es un "todavía no", se acuerda el siguiente paso con
día concreto.

### El arco completo

| Fase | Objetivo | Señal de que puedes avanzar |
|---|---|---|
| 1. Enganche | Que responda | Contestó algo |
| 2. Calificación | Saber qué enseña y a cuántos | Te lo dijo |
| 3. Diagnóstico | Que **él** nombre su problema | "Lo llevo por WhatsApp y es un caos" |
| 4. Demostración | Que lo vea funcionando | Entró a la demo |
| 5. Valor | Conectar su dolor con lo que vio | Pregunta por precio o por detalles |
| 6. Precio | Decirlo entero y sin rodeos | Objeta (bien) o calla (mal) |
| 7. Objeción | Desglose o garantía | La objeción se disuelve |
| 8. Cierre | Pedirla | "¿Cómo pago?" |

**No se salta de 1 a 6.** Hoy el agente empieza en 6.

---

## 5. Cambios de configuración (sin esto, el prompt nuevo no sirve)

| Campo | Hoy | Debe ser | Por qué |
|---|---|---|---|
| `aiModel` | *(vacío → `gpt-4o-mini`)* | **`gpt-4o`** | El mini no sostiene una venta consultiva con instrucciones largas |
| `maxTokens` | 800 | **180** | Techo físico al monólogo. Es la palanca más efectiva de todas |
| `temperature` | 0.4 | **0.6** | 0.4 produce la repetición literal de los bloques enlatados |
| `handoffEnabled` | `false` | **`true`** | Que la derivación del prompt pueda ejecutarse |
| `handoffNumbers` | *(vacío)* | el número del equipo | Sin esto la derivación no llega a nadie |
| `greeting` | *(vacío)* | dejarlo vacío | Correcto: el saludo lo compone el prompt según el caso |

**Mover el catálogo a RAG.** `ragEnabled` ya está en `true` con `topK: 5` y no se
está aprovechando: todo el detalle de producto está incrustado en el prompt. Las
fichas de planes, el desglose de los S/ 4 700, las objeciones largas y las
preguntas técnicas deben ser **documentos del agente**, no system prompt. El
prompt se queda con la conducta; los datos se recuperan cuando hacen falta.

Eso es lo que baja de 45 000 a ~7 000 caracteres sin perder ni un dato.

---

## 6. El prompt nuevo

Vive en su propio documento, para no mantener dos copias que se desincronicen:

### → [docs/prompt-agente-maya-classroom.md](./prompt-agente-maya-classroom.md)

Ahí está el prompt completo listo para pegar (de 45 130 a ~10 400 caracteres),
con **cada dato contrastado contra la landing pública** — 34 de 34 afirmaciones
verificadas: precios, IGV, almacenamiento por plan, garantía, plazos y la
comparación con el marketplace.

> **Nota sobre las clases en vivo.** El prompt viejo las declaraba una
> integración con Zoom y Meet *"EN CAMINO, no entregada"*, y lo imponía como
> límite sin excepciones. El equipo confirmó el 2026-09-11 que **están
> desarrolladas de forma nativa**, como las vende la landing. En el prompt nuevo
> dejan de ser una limitación que esconder y pasan a ser argumento de venta.

## 7. Cómo saber si mejoró

Vuelve a medir en dos semanas. Estas cinco cifras son la prueba:

| Indicador | Hoy | Objetivo |
|---|---|---|
| Longitud mediana del agente | 528 car. | **< 250** |
| Conversaciones que necesitan humano | 70 % | **< 35 %** |
| Mensajes del agente con pregunta | 41 % | **> 85 %** |
| Preguntas sobre el negocio del cliente | 7 en total | **≥ 1 por conversación** |
| Conversaciones que superan 4 mensajes | 38 % | **> 60 %** |

La más importante es la segunda. Cada punto que baja es tiempo de una persona
que deja de vigilar una bandeja.

---

## 8. Orden de aplicación

1. **`maxTokens` a 180 y modelo a `gpt-4o`.** Cambio de un minuto, y es el que
   más mueve la aguja. Se puede hacer hoy mismo, incluso antes del prompt nuevo.
2. **Prompt nuevo**, con las reglas al principio y la lista de comprobación al final.
3. **Mover el catálogo a documentos RAG** y quitarlo del prompt.
4. **Activar la derivación** y poner el número del equipo.
5. **Medir a las dos semanas** con la tabla de arriba.

Los pasos 1 y 2 deberían notarse el mismo día.
