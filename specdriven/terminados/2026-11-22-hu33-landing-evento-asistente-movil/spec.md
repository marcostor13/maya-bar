# HU33 — Landing del evento cómoda para el invitado en el móvil · Especificación

Historia: `backlog/hu33-landing-evento-asistente-movil.md` · Fecha: 2026-11-22 · Estado: aprobada

## Objetivo

Que el invitado sepa qué, cuándo y dónde, se registre en segundos desde el móvil y se quede con su entrada.

## Usuarios

- **Invitado** (anónimo, desde el link o el QR).

## Alcance

- **Incluye**: descripción y lugar en la landing, formulario con autocompletado, acciones tras registrarse, entrada recordada en el dispositivo, textos de precio honestos, alturas `dvh`.
- **No incluye**: pago en línea; mapa embebido.

## Requisitos

- R1: el endpoint público devuelve `venue` = nombre del local + dirección (o el `location` propio del evento si existe); nada más del local.
- R2: sin diseño, la landing muestra descripción y lugar con "Cómo llegar"; con diseño, un botón "Detalles" abre una hoja con lo mismo.
- R3: campos con `autocomplete`, `inputmode`, `enterkeyhint`; sin `autofocus` al cargar; el foco va al nombre al abrir; Esc cierra; foco atrapado; hoja `92dvh`.
- R4: tras registrarse: Añadir al calendario (.ics) y Google Calendar, Guardar entrada (PNG), Cómo llegar, Invitar a un amigo (conserva `?ref=`).
- R5: la entrada se guarda en `localStorage` por evento y se muestra al volver ("Ya estás registrado"); "Registrar a otra persona" la olvida.
- R6: botón "Reservar mi lugar" / "Reservar entrada · S/ X" y nota "se paga en el local".

## Criterios de aceptación

- C1: la landing muestra descripción, fecha, hora y lugar con "Cómo llegar".
- C2: autocompletado de nombre, email y teléfono; al cargar no se abre el teclado.
- C3: tras registrarse se puede añadir al calendario, descargar la entrada y compartir.
- C4: al volver a abrir el link en el mismo dispositivo ve su entrada sin registrarse de nuevo.
- C5: ningún texto promete un pago que no existe.
- C6: en 360 × 640 con el teclado abierto el botón de enviar es alcanzable (hoja con `max-height: 92dvh` y scroll propio).

## Preguntas abiertas resueltas

- Pago: en el local. Lugar: dirección del local, con campo opcional `location` del evento.
