# Campaña de recuperación — Maya Classroom

Análisis de las **76 conversaciones** de `admin@ignia.site` y de las dos páginas
públicas, con el mensaje de recuperación y la lista de destinatarios.
Datos de producción del 2026-09-12.

Ficheros que acompañan:
- [`destinatarios-recuperacion.csv`](./destinatarios-recuperacion.csv) — **66 personas**
- [`excluidos-recuperacion.csv`](./excluidos-recuperacion.csv) — 10, con su motivo

---

## 1. Lo primero: esto no es una recuperación

| Días desde el último mensaje | Conversaciones |
|---|---|
| 0 – 7 | **72** |
| 8 – 30 | 4 |
| más de 30 | 0 |

**Nadie está frío.** El 95 % escribió en los últimos siete días. No hay que
resucitar a nadie: hay que **rescatar un pipeline que se está enfriando ahora
mismo**, y eso cambia el mensaje entero. Un "hace tiempo que no hablamos" sería
ridículo y quemaría el contacto.

Es una noticia buena: la recuperación en caliente convierte mucho mejor.

---

## 2. Por qué se cayeron

### 33 de 66 nunca llegaron a conversar

El último mensaje del cliente es, **30 veces**, exactamente el mismo:

> *"¿Qué tipo de aulas ofrecen?"*

Y otras tantas: *"¿Cuál es el precio del alquiler?"*

No son preguntas: son los **botones prellenados del anuncio de Meta**. Esa gente
hizo clic, recibió del agente un párrafo de 500 caracteres con el catálogo entero
y el precio, y no volvió a escribir. Nunca hubo conversación.

> Cuadra con el [análisis del agente](./analisis-agente-ia.md): escribe 528
> caracteres de mediana frente a los 27 del cliente, y solo hizo 7 preguntas
> sobre el negocio de alguien en 157 mensajes.

### 52 de 66 sí vieron el precio

Y aun así se fueron. Eso no es un problema de precio: es que **recibieron el
precio antes de entender qué compraban**. Nadie les preguntó qué enseñaban.

### Las objeciones reales que quedaron colgando

Repetidas en los últimos mensajes:

- **El dominio** — *"aparte tengo que pagar por mi dominio"*, *"¿Hay pago anual por dominio o solo es mensual?"*, *"¿Qué ocurre si ya tengo mi dominio y hosting?"*
- **La demo** — *"¿Algún demo?"*, *"aca decia demo"*, *"Quiero ver el curso por dentro, pero me sale para inscribirme"*
- **Encaje** — *"Academia pre universitaria… solo dictamos clases presenciales"*, *"Grupo de estudios con respaldo de colegio y estamos iniciándonos"*

La de la demo duele especialmente: **es el activo más fuerte que tienen** —un
aula real que se abre sin registrarse— y la gente la pedía sin encontrarla,
porque iba enterrada al final del muro de texto.

---

## 3. Qué se está ofreciendo (las dos páginas)

Son dos páginas con papeles distintos, y conviene no confundirlas:

| | `/landing` | `/` (raíz) |
|---|---|---|
| Papel | Página de venta | Sitio de producto y documentación |
| Trato | tú | usted |
| Contenido | Precios, planes, garantía, comparativa | 27 artículos de documentación en abierto |

**Argumentos verificados en las dos** (ya contrastados en el
[prompt nuevo](./prompt-agente-maya-classroom.md)):

- Implementación S/ 347 + IGV, pago único. Inicia S/ 47 + IGV/mes (300 alumnos,
  300 GB), Crece S/ 99 + IGV/mes (2 000 alumnos, 700 GB).
- **Clase en vivo dentro del aula**, con pizarra, chat y pantalla compartida; la
  grabación y la asistencia quedan guardadas solas. Sin Zoom.
- **0 % de comisión** por venta, frente al 7,5–9,9 % de un marketplace.
- Garantía: funcionando en 7 días hábiles o se devuelve la implementación.
- **Demo abierta, sin registrarse y tocándolo todo.**
- **27 artículos de documentación pública, sin pedir cuenta.**

Los dos últimos son oro para una recuperación y no se están usando: dicen "no
tengo nada que esconder" sin pedir nada a cambio.

---

## 4. Cómo debe ser un mensaje de recuperación

Cinco reglas, y ninguna es "ofrecer un descuento".

**1. Reconocer sin culpar.** El mensaje asume el fallo propio ("te solté un
ladrillo de información"), no reprocha el silencio. Nada de "veo que no me
respondiste".

**2. Una sola cosa que pedir, y que cueste poco.** No "¿retomamos?", que obliga a
decidir. Un clic en la demo, o responder una palabra.

**3. Dar antes de pedir.** Se abre con algo de valor —el aula abierta, la
respuesta a la duda que dejó colgando—, no con la oferta.

**4. Corto de verdad.** Es lo contrario de lo que falló. Tres líneas.

**5. Una razón honesta para actuar ahora.** Aquí entra tu idea del precio, y solo
funciona si es verdad.

---

## 5. Sobre tu idea del precio de por vida

**La idea es buena.** Un precio congelado es más potente que un descuento: no
abarata el producto —no toca los S/ 347— y premia decidir pronto. Y en un
producto con mensualidad, el valor percibido es enorme.

Tres reparos, en orden de importancia:

**a) Solo vale si vais a subir el precio de verdad.** Si no, es escasez inventada
—exactamente lo que el propio prompt del agente prohíbe en su límite nº 6— y con
66 personas en un mercado pequeño como el de academias en Lima, se sabe.

**b) "Los 50 primeros" no encaja con 66 destinatarios.** Es tan parecido a
"todos" que se nota. Dos alternativas mejores:
- **Bajar el número: "las 20 primeras"** → creíble y de verdad limitado.
- **Ponerle fecha en vez de cupo**: *"quien contrate antes del 30 de septiembre"*.
  Es verificable, no suena a truco y crea la misma urgencia.

Mi recomendación: **fecha**, porque no obliga a llevar la cuenta en público ni a
explicar qué pasa cuando alguien pregunta cuántos cupos quedan.

**c) Hay que poder cumplirlo.** Un precio de por vida es un compromiso
permanente: apuntad quién lo tiene. Cuando subáis la tarifa, alguien tendrá que
saber a quién no se le sube.

---

## 6. ⚠️ La restricción que condiciona todo el envío

La cuenta usa **WhatsApp Cloud API**. Meta solo permite texto libre **dentro de
las 24 horas** desde el último mensaje del cliente. Fuera de esa ventana, solo
pasan **plantillas aprobadas**.

| | Personas | Qué se puede enviar |
|---|---|---|
| Dentro de 24 h | **19** | Texto libre, ya |
| Fuera de 24 h | **47** | **Solo plantilla aprobada por Meta** |

**A 47 de 66 no les llega un texto libre.** No es que llegue mal: no se entrega.
Hay que dar de alta la plantilla en Meta (categoría *Marketing*, suele aprobarse
en menos de 24 h) antes de poder mandar nada.

Por eso abajo hay dos versiones del mensaje, no una.

---

## 7. Los mensajes

### 7.1 Plantilla para los 47 (fuera de la ventana)

Para dar de alta en Meta. Categoría **Marketing**, idioma **es**.
Nombre sugerido: `recuperacion_aula_demo`.

```
Hola {{1}}, soy Marcos de Maya Classroom 👋

El otro día te mandé toda la información de golpe y la verdad es que así no
se entiende nada. Te lo dejo en una sola frase: montamos tu propia aula
virtual, con tu marca y en tu dominio, funcionando en 7 días.

Mira una de verdad, con sus cursos y sus alumnos dentro. No pide usuario ni
contraseña, se entra directo:
https://mayaclassroom.ignia.site/auth/login

¿Qué enseñas? Con eso te digo en un minuto si te encaja o no.
```

Variable: `{{1}}` = nombre del contacto (la columna `nombre` del CSV).

**Por qué funciona:** reconoce el fallo real sin culpar a nadie, resume en una
frase lo que antes eran 500 caracteres, pone la demo **sola y sin condiciones**
—que es lo que pedían y no encontraban—, y cierra con la pregunta de
calificación que nunca se hizo. No menciona precio: ya lo vieron 52 de ellos, y
repetirlo es volver al error.

### 7.2 Texto libre para los 19 (dentro de la ventana)

Aquí se puede ser más directo y encadenar mensajes. **Mándalos por separado**,
no como un bloque:

```
Hola {nombre}, soy Marcos de Maya Classroom 👋
El otro día te solté toda la información de golpe. Mi culpa.
```

```
En una frase: montamos tu propia aula virtual, con tu marca y en tu dominio.
Clases en vivo, tareas, notas y certificados, todo dentro.
```

```
Mírala funcionando, sin registrarte:
https://mayaclassroom.ignia.site/auth/login
```

```
¿Qué enseñas y a cuántos alumnos? Con eso te digo si te encaja.
```

### 7.3 El segundo toque, con la oferta (48–72 h después)

**Solo a quien haya respondido o abierto la demo.** Mandar la oferta a quien
sigue en silencio es quemarla.

```
Una cosa más: en octubre subimos la mensualidad.

Quien deje su aula contratada antes del 30 de septiembre se queda con el
precio de hoy —S/ 47 + IGV al mes— de forma permanente, aunque suba después.

Si te interesa, dime qué enseñas y lo vemos.
```

> Cambia la fecha y el importe por los reales. **Si no vais a subir el precio,
> borra este mensaje entero**: no compensa.

### 7.4 Los 4 que quedaron sin respuesta — esto va aparte y primero

Estas personas hicieron una pregunta concreta y **nadie les contestó**. Mandarles
una campaña sería la peor forma de reaparecer. Van a mano, hoy, respondiendo lo
que preguntaron:

| Persona | Lo que preguntó | Qué contestar |
|---|---|---|
| Leonardo Ortiz | *"aparte tengo que pagar por mi dominio"* | El dominio va incluido en la mensualidad, con su certificado |
| FA | *"¿Hay pago anual por dominio o solo es mensual?"* | Lo mismo: incluido, sin pago aparte |
| GIPTE | *"Noche sería, no la hago ya salí…"* | **Estaba cerrando una hora para hablar.** Es el más caliente de los 76 |
| Tony | *"Academia preuniversitaria, solo dictamos clases presenciales"* | Te está calificando él solo: el aula sirve para material, notas y certificados aunque la clase sea presencial |

---

## 8. A quién se envía

**66 personas** en `destinatarios-recuperacion.csv`, con su teléfono, días sin
hablar, si están dentro de la ventana de 24 h, si vieron el precio y su último
mensaje.

### Los 10 excluidos y por qué

| Motivo | Nº | Detalle |
|---|---|---|
| Etiquetados **Interesado** | 3 | Giancarlo, Fabio Ureta, J. Arturo Martínez — como pediste |
| **Pidió no ser contactado** | 1 | Alex: *"No enviar recordatorio por favor ni spam"* |
| Quedaron sin respuesta | 4 | Van aparte, a mano (apartado 7.4) |
| Número interno | 1 | +51 975 760 418, vuestro propio número |
| No es una persona | 1 | Un SMS de verificación de Facebook |

**El opt-out de Alex es innegociable.** Súbelo además a la lista de no contactar
del módulo, que hoy está vacía: si no queda registrado, el próximo envío lo
vuelve a incluir.

### Cómo se reparten los 66

| | |
|---|---|
| Dentro de 24 h (texto libre) | 19 |
| Fuera de 24 h (plantilla) | 47 |
| Vieron el precio | 52 |
| Solo hicieron clic en el anuncio | 33 |

---

## 9. Orden de ejecución

1. **Hoy**: contestar a mano a los 4 del apartado 7.4. Son los más calientes.
2. **Hoy**: dar de alta a Alex en la lista de no contactar.
3. **Hoy**: subir la plantilla `recuperacion_aula_demo` a Meta para aprobación.
4. **Hoy**: mandar el texto libre a los 19 de dentro de la ventana. No esperan a
   la plantilla y son los más recientes.
5. **Al aprobarse la plantilla**: enviar a los 47 restantes.
6. **A las 48–72 h**: el segundo toque con la oferta, solo a quien respondió.

Y antes de todo esto, **aplica el [prompt nuevo](./prompt-agente-maya-classroom.md)
y sube el modelo**. Si no, cada persona que conteste vuelve a recibir el mismo
muro de texto que la ahuyentó la primera vez, y habrás gastado el segundo
intento igual que el primero.
