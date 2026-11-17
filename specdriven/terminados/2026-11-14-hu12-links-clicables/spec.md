# HU12 — Links clicables en los mensajes de los chats · Especificación

Historia: `backlog/hu12.md` · Fecha: 2026-11-14 · Estado: cerrada

## Objetivo

Que el equipo abra con un clic los links que aparecen en las conversaciones
(los que manda el cliente y los que envía el agente o una persona), sin copiar
y pegar. Solo cambia cómo se muestra el texto, no lo que se guarda ni lo que se envía.

## Usuarios

- Persona del equipo en la bandeja: abrir links del cliente y comprobar los enviados.
- Quien configura un agente IA: probar en el playground los links que manda el agente.

## Alcance

- Incluye: detector compartido de links y correos; pintado como `<a>` en la
  burbuja de la bandeja, la lectura de adjuntos, las notas del sistema, el
  playground de agentes IA, las notas de leads y el seguimiento de contactos.
- **Fuera de alcance:** teléfonos como link; formato de WhatsApp (`*negrita*`);
  vista previa del link (tarjeta con imagen); cambios en el backend o en lo
  que se envía al cliente; el cuerpo HTML de los correos (hoy se muestra como texto).

## Requisitos (EARS)

Funcionales:
- **R1** — Cuando un texto de mensaje contiene una URL `http://` o `https://`,
  el sistema debe pintarla como link que abre esa URL en una pestaña nueva.
- **R2** — Cuando el texto contiene una dirección que empieza por `www.`, el
  sistema debe pintarla como link a `https://` + la dirección.
- **R3** — Cuando el texto contiene un correo (`nombre@dominio.tld`), el sistema
  debe pintarlo como link `mailto:`.
- **R4** — La puntuación final que no forma parte de la URL (`. , ; : ! ?` y
  comillas, y un `)` sin `(` abierto dentro de la URL) debe quedar fuera del link.
- **R5** — El texto alrededor de los links debe mostrarse igual que hoy
  (saltos de línea, espacios, corte de URLs largas).
- **R6** — El comportamiento debe ser el mismo en las seis vistas del alcance.

No funcionales:
- **R7 (seguridad)** — El texto nunca se inserta como HTML; solo se generan
  links con esquema `http`, `https` o `mailto`; los links llevan
  `rel="noopener noreferrer"` y `target="_blank"` (salvo `mailto`).
- **R8 (accesibilidad/diseño)** — El link se distingue por color y subrayado
  con variables de `styles.scss`, legible en la burbuja propia (fondo de marca)
  y en la del cliente; recibe foco con teclado.
- **R9 (rendimiento)** — El análisis es lineal en la longitud del texto y no se
  repite en cada detección de cambios (pipe puro o `computed`).

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | Dado "mira https://a.com/x?y=1", cuando se analiza, entonces hay un link con `href` `https://a.com/x?y=1` y texto igual | unitaria `linkify.spec.ts` |
| C2 | R2 | Dado "entra a www.tienda.pe", entonces link con `href` `https://www.tienda.pe` y texto `www.tienda.pe` | unitaria |
| C3 | R3 | Dado "escribe a ventas@maya.pe.", entonces link `mailto:ventas@maya.pe` sin el punto final | unitaria |
| C4 | R4 | Dado "(ver https://a.com/x)." y "https://es.wikipedia.org/wiki/A_(b)", entonces el primero excluye `).` y el segundo conserva `(b)` | unitaria |
| C5 | R5 | Dado un texto con dos URLs y saltos de línea, entonces la unión de los trozos es idéntica al texto original | unitaria |
| C6 | R7 | Dado "<script>alert(1)</script> javascript:alert(1) data:text/html,x", entonces no hay ningún link y el componente pinta el texto literal (sin elemento `script`) | unitaria del componente |
| C7 | R7, R1 | Dado el componente con una URL, entonces renderiza `<a href=… target="_blank" rel="noopener noreferrer">` | unitaria del componente |
| C8 | R6 | Dado un mensaje de la bandeja con una URL, cuando se abre la conversación, entonces la burbuja contiene ese `<a>`; las otras cinco vistas usan el mismo componente | unitaria de la bandeja + revisión del diff |
| C9 | R8 | El estilo del link usa solo variables del design system | revisión del código |
| C10 | R9 | El análisis se hace en un `computed` del componente | revisión del código |
| C11 | R1 | En la app Android, pulsar un link abre el navegador del sistema, no la URL dentro de la app **[usuario]** | manual |

## Supuestos y decisiones por defecto

- Pieza compartida: función pura `linkify(text)` → trozos `{text}` / `{text, href}`
  y componente `<app-rich-text [text]>` que los pinta con la plantilla de
  Angular (sin `innerHTML`).
- En Capacitor Android un `target="_blank"` a un dominio externo lo abre el
  sistema (comportamiento por defecto del bridge); no se añade plugin. Queda
  como comprobación manual (C11).
- Los links cortos de la plataforma se pintan tal cual: el clic pasa por la URL
  corta y se sigue contando.
- Un clic en el link no dispara otras acciones de la burbuja (hoy la burbuja no
  tiene acción al hacer clic; responder es un botón aparte).

## Preguntas abiertas

- Ninguna.
