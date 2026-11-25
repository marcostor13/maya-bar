# HU74 — Buscar dentro de las conversaciones · Especificación

Historia: `hu.md` · Fecha: 2026-11-24 · Estado: aprobada (pedido del usuario)

## Objetivo

Que quien atiende la bandeja encuentre una conversación por lo que se dijo en
ella, no solo por el nombre o el número del contacto. Hoy un mensaje que no es
el último no se puede encontrar sin abrir chat por chat.

## Usuarios

- Vendedor, marketing, administrador (roles CRM que ya ven la bandeja): buscar
  un tema en sus chats y saltar al mensaje.

## Alcance

- Incluye: búsqueda en texto, pie de adjunto (`text`), transcripción de audio
  (`transcript`) y asunto de correo (`subject`) de los mensajes; fragmento
  resaltado en la lista; salto al mensaje al abrir el chat; WhatsApp,
  Instagram, Messenger, chat web y correo.
- **Fuera de alcance:** búsqueda difusa o por sinónimos, búsqueda dentro de
  documentos adjuntos (PDF), lista de todas las coincidencias de un mismo chat
  (se muestra la más reciente), búsqueda en la papelera, Atlas Search.

## Requisitos (EARS)

Funcionales:
- **R1** — Cuando el usuario escribe en el buscador de la bandeja un texto de
  2 o más caracteres, el sistema debe devolver, además de las conversaciones
  que coinciden por nombre, número o último mensaje, las que tienen algún
  mensaje (texto, transcripción o asunto) que contiene ese texto, sin distinguir
  mayúsculas.
- **R2** — Cuando una conversación aparece por un mensaje, el sistema debe
  adjuntarle la coincidencia más reciente: id del mensaje, fecha y un fragmento
  de hasta ~90 caracteres alrededor del texto buscado.
- **R3** — Cuando hay coincidencia de mensaje, la lista debe mostrar el
  fragmento en lugar del último mensaje, con el texto buscado resaltado.
- **R4** — Cuando el usuario abre una conversación encontrada por un mensaje, la
  vista debe desplazarse hasta ese mensaje y resaltarlo, cargando páginas
  anteriores si hace falta (hasta 10 páginas de 50).
- **R5** — Si el mensaje no aparece en esas páginas, entonces el sistema debe
  avisar con un toast informativo y dejar el chat abierto al final.
- **R6** — Los demás filtros de la bandeja (canal, cuenta, agente, etiquetas,
  asignación, campaña) siguen aplicándose a los resultados.

No funcionales:
- **R7** (seguridad) — La búsqueda solo considera mensajes del `tenantId` del
  JWT; el texto buscado se escapa (no se interpreta como expresión regular).
- **R8** (rendimiento) — La consulta de mensajes usa un índice
  `{tenantId, at}`, limita las coincidencias revisadas (500) y corta a los
  5 s (`maxTimeMS`); si se corta, devuelve lo que coincide por nombre/número en
  vez de fallar.
- **R9** (accesibilidad) — El resaltado usa `<mark>` y el buscador mantiene su
  `aria-label`.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1, R2 | Dado un chat cuyo último mensaje no contiene "factura", y un mensaje antiguo que sí, cuando se busca `q=FACTURA`, entonces el chat aparece con `match.messageId` de ese mensaje y un `snippet` que contiene "factura" | e2e de API |
| C2 | R7 | Dada otra empresa con un mensaje que contiene la palabra, cuando busca la primera empresa, entonces ese chat no aparece | e2e de API |
| C3 | R1 | Dada una búsqueda de 1 carácter, entonces no se buscan mensajes (solo nombre/número) | e2e de API |
| C4 | R1 | Dado un audio con `transcript` que contiene la palabra, cuando se busca, entonces el chat aparece | e2e de API |
| C5 | R6 | Dado un filtro de canal distinto al del chat encontrado, entonces no aparece | e2e de API |
| C6 | R7 | Dado `q` con caracteres de regex (`.*(`), entonces responde 200 y no coincide con todo | e2e de API |
| C7 | R2 | El fragmento se recorta alrededor de la coincidencia con "…" y no supera ~90 caracteres | prueba unitaria |
| C8 | R3, R9 | El texto se parte en trozos con la coincidencia marcada (sin distinguir mayúsculas) | prueba unitaria del frontend |
| C9 | R4, R5 | Al abrir un chat encontrado, la vista salta al mensaje y lo resalta; si no está, toast informativo | manual en el navegador |

## Supuestos y decisiones por defecto

- Mínimo 2 caracteres para buscar en mensajes (1 carácter coincidiría con casi todo).
- Se usa regex con índice por empresa en vez de índice `$text`: `$text` no
  encuentra trozos de palabras ("fact" → "factura") y Atlas Search no se usa en
  el clúster compartido.
- Se ignoran los mensajes de sistema (`author: system`).

## Preguntas abiertas

- Ninguna.
