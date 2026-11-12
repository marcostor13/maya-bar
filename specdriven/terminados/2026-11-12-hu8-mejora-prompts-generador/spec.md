# HU8 — Mejora de prompts y generador de agentes IA · Especificación

Historia: `backlog/hu8.md` · Fecha: 2026-11-12 · Estado: aprobada

## Objetivo

Que los agentes IA mejoren con el uso real y que crear uno no exija saber
escribir prompts. Hoy mejorar un prompt exige leer conversaciones a mano (como
se hizo con Sovereign el 2026-11-12) y crear un agente parte de un prompt
genérico de una línea.

## Usuarios

- Admin / gerente del CRM (roles `CRM_ROLES`, módulo `ai-agents`): revisa
  sugerencias, las aplica o descarta, vuelve a una versión anterior y genera
  agentes nuevos.

## Alcance

- Incluye:
  - Análisis bajo demanda de las conversaciones recientes de un agente con IA,
    que devuelve un resumen y sugerencias concretas de cambio al prompt, con
    evidencia (conversaciones de ejemplo).
  - Aplicar o descartar cada sugerencia por separado, viendo antes/después.
  - Historial de versiones del prompt y restauración de una versión.
  - Generador: formulario corto sobre el negocio → borrador de agente (nombre,
    descripción, prompt, saludo, criterios de derivación) que el usuario
    revisa y guarda.
- **Fuera de alcance:** análisis automático programado; aplicar cambios sin
  aprobación; mejorar campos distintos del prompt (modelo, temperatura,
  canales); evaluación automática (A/B) de prompts; generar la base de
  conocimiento.

## Requisitos (EARS)

Funcionales:
- **R1** — Cuando el usuario pide analizar un agente con un periodo (1–90 días,
  14 por defecto), el sistema debe leer hasta 30 conversaciones de ese agente
  en el periodo (priorizando las derivadas a humano y las que terminan con el
  cliente sin respuesta), enviarlas a la IA junto con el prompt actual y
  guardar un análisis con resumen y hasta 10 sugerencias.
- **R2** — Cada sugerencia debe tener título, problema observado, evidencia
  (id de conversación + fragmento) y un cambio aplicable: `add` (texto nuevo
  que se añade), `replace` (texto exacto del prompt → texto nuevo) o `remove`.
- **R3** — Si el agente no tiene conversaciones en el periodo, entonces el
  sistema debe responder un error claro sin llamar a la IA.
- **R4** — Cuando el usuario aplica una sugerencia, el sistema debe modificar
  el prompt actual, guardar la versión anterior en el historial y marcar la
  sugerencia como aplicada.
- **R5** — Si el texto a reemplazar o quitar ya no está en el prompt actual,
  entonces el sistema debe rechazar la aplicación (409) sin modificar nada.
- **R6** — Cuando el usuario descarta una sugerencia, el sistema debe marcarla
  descartada sin tocar el prompt.
- **R7** — Cada vez que el prompt de un agente cambia (edición manual,
  sugerencia o restauración), el sistema debe guardar la versión anterior con
  su origen, fecha y autor.
- **R8** — Cuando el usuario restaura una versión, el sistema debe poner ese
  texto como prompt actual (guardando el que había).
- **R9** — Cuando el usuario completa el generador (nombre del negocio, rubro,
  qué vende, objetivo del agente, tono, idioma y, opcionales, preguntas
  frecuentes y cuándo derivar), el sistema debe devolver un borrador de agente
  sin guardarlo; el agente se crea solo cuando el usuario lo guarda, como
  borrador (no publicado).
- **R10** — Si la IA falla, tarda demasiado o devuelve un formato inválido,
  entonces el sistema debe responder un error accionable (p. ej. "La IA tardó
  demasiado o no respondió…") y no guardar nada a medias.

No funcionales:
- **R11 (seguridad)** — Todos los endpoints exigen `JwtAuthGuard` +
  `ModuleGuard('ai-agents')` + `CRM_ROLES` y filtran por el `tenantId` del
  token. El contenido de las conversaciones se trata como no confiable: el
  prompt del analizador lo declara como datos, la salida se valida (tipos,
  longitudes, cantidad) y ningún cambio se aplica sin acción del usuario.
- **R12 (privacidad)** — Antes de enviar las conversaciones a la IA se ocultan
  teléfonos y correos (también en el resumen que devuelve la IA); se usan las API keys de IA del tenant y, si no tiene, las de la plataforma, igual que al responder los agentes. Para acotar el coste, análisis y generador tienen un tope de 20 llamadas por hora e IP.
- **R13 (rendimiento)** — El texto enviado a la IA se limita (≈ 60 000
  caracteres); el análisis tarda menos de 2 minutos o falla con un mensaje.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | Dado un agente con conversaciones, cuando se analiza, entonces se envían a la IA solo conversaciones de ese agente y tenant en el periodo, máx. 30, priorizando derivadas y sin respuesta, y se guarda el análisis | unitaria |
| C2 | R2, R10, R11 | Dada una respuesta de la IA con sugerencias inválidas (sin cambio, acción desconocida, `replace` con texto que no está en el prompt, más de 10), cuando se procesa, entonces se descartan o recortan; si el JSON es inválido, error y nada guardado | unitaria |
| C3 | R3 | Dado un agente sin conversaciones en el periodo, cuando se analiza, entonces error 400 y la IA no se llama | unitaria |
| C4 | R4, R7 | Dada una sugerencia pendiente, cuando se aplica, entonces el prompt cambia según la acción, se guarda la versión anterior con origen `suggestion` y la sugerencia queda `applied` | unitaria |
| C5 | R5 | Dado que el prompt cambió y el texto a reemplazar ya no está, cuando se aplica, entonces 409 y nada cambia | unitaria |
| C6 | R6 | Cuando se descarta, entonces queda `discarded` y el prompt no cambia | unitaria |
| C7 | R7 | Cuando se edita el prompt a mano (PATCH con otro texto), entonces se guarda la versión anterior con origen `manual`; si el texto no cambia, no se guarda versión | unitaria |
| C8 | R8 | Cuando se restaura una versión, entonces el prompt pasa a ser ese texto y el anterior queda en el historial con origen `restore` | unitaria |
| C9 | R9 | Cuando se genera un agente, entonces se devuelve un borrador con nombre, descripción, prompt, saludo y criterios de derivación, y no se crea ningún agente | unitaria |
| C10 | R11 | Dado un agente de otro tenant, cuando se analiza, aplica, restaura o lista, entonces 404 | unitaria |
| C11 | R12 | Cuando se arma el texto para la IA, entonces teléfonos y correos aparecen ocultos | unitaria |
| C12 | R1–R9 | En la interfaz: desde la tarjeta del agente se abre "Mejorar", se lanza un análisis, se ven resumen y sugerencias con antes/después y enlaces a las conversaciones, se aplica/descarta (con confirmación), se ve el historial y se restaura; desde "Generar con IA" se completa el formulario, se revisa el borrador y se crea el agente | unitarias de frontend |
| C13 | R10, R13 | Si la IA falla, el usuario ve un toast de error y no queda análisis ni agente a medias | unitaria (backend y frontend) |
| C14 | — | Prueba real con las conversaciones de un cliente y su API key **[usuario]** | manual |

## Supuestos y decisiones por defecto

- El análisis es síncrono (una llamada a la IA con tope de tiempo de 110 s);
  no hace falta cola para ≤ 30 conversaciones.
- Se usa el mismo proveedor/modelo del agente (`provider`, `aiModel`) con las
  keys del tenant, temperatura 0.2.
- Conversaciones del agente = `conversation.agentId` del agente (se guarda
  cuando el agente responde), no en papelera.
- Historial: se guardan todas las versiones; la interfaz muestra las 30 más
  recientes.
- Las nuevas pantallas son páginas propias (`/ai-agents/:id/mejoras`,
  `/ai-agents/generar`), en línea con la HU9.
- El generador no publica ni conecta canales: crea un borrador.

## Preguntas abiertas

- Ninguna.
