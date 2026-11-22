# HU33 — Landing del evento: registrarse y guardar la entrada en el móvil

## Historia

**Como** invitado que abre el link del evento desde WhatsApp o Instagram,
**quiero** ver qué es, dónde y cuándo, registrarme en segundos y guardar mi entrada,
**para** llegar al evento sin buscar el correo ni volver a registrarme.

## Contexto (estado actual)

Archivo: `pages/public-event/public-event.ts`.

- **No se muestra la descripción.** `paragraphs` se calcula (l.863) pero no se pinta en la plantilla.
- **No hay lugar.** El evento no tiene dirección y la del local (`local.schema.ts` l.42, `address`) no se muestra: el invitado no sabe a dónde ir.
- **El formulario del cajón (l.315-398) no ayuda en el móvil**:
  - Sin `autocomplete` (`name`, `email`, `tel`), `inputmode` ni `enterkeyhint`: el teclado no autocompleta.
  - `autofocus` en el nombre (l.319) dentro de un cajón que está en el DOM aunque esté cerrado: puede abrir el teclado o mover la página al cargar.
  - Sin Esc ni foco atrapado en el cajón.
- **La entrada se pierde al recargar.** La pantalla de éxito (l.406-430) solo muestra el QR. No hay "Añadir al calendario", "Guardar entrada", "Cómo llegar" ni "Invitar a un amigo", y nada se guarda en el dispositivo.
- **El botón promete un pago que no existe.** Dice "Comprar entrada · S/ X" (l.287), pero solo registra; no hay pago.
- **`min-height: 100vh`** (l.439, 446, 450): en el móvil la barra del navegador corta el contenido.

## Propuesta

1. **Mostrar la información del evento.**
   - Sin diseño: la descripción y el lugar (nombre y dirección del local, con enlace "Cómo llegar" a Google Maps).
   - Con diseño: un botón "Detalles" que abre una hoja con esa misma información.
2. **Formulario**:
   - `autocomplete="name" | "email" | "tel"`, `inputmode` y `enterkeyhint="next"/"send"`.
   - Foco en el nombre solo al abrir el cajón.
   - Esc y botón cerrar; foco atrapado mientras está abierto.
   - El cajón con `max-height: 90dvh` y scroll propio, para que el teclado no tape el botón.
3. **Pantalla de éxito** con:
   - "Añadir al calendario": `.ics` y Google Calendar.
   - "Guardar entrada": PNG con el QR, el nombre y el evento.
   - "Cómo llegar".
   - "Invitar a un amigo": `navigator.share` con el link y el `?ref=` del impulsador si vino con uno.
4. **Recordar la entrada.** Se guarda el código en `localStorage` por evento: si el invitado vuelve a abrir el link, ve "Ya estás registrado" con su QR, y además tiene un enlace "No soy yo / registrar a otra persona".
5. **Texto del botón**:
   - Gratis: "Reservar mi lugar".
   - De pago: "Reservar entrada · S/ X", con la nota "Pagas en el local", hasta que exista un pago en línea.
6. **Altura**: `100dvh` (con `100vh` de respaldo).

## Preguntas abiertas

- ¿El pago de eventos con precio es en el local? Por defecto se asume que sí, y el texto lo dirá así.
- ¿Se añade un campo "lugar" propio del evento? Por defecto se usa la dirección del local; un campo opcional del evento la sobrescribe.

## Criterios de aceptación (borrador)

- C1: la landing muestra descripción, fecha, hora y lugar con "Cómo llegar".
- C2: el formulario autocompleta nombre, email y teléfono en Chrome Android y Safari iOS; al cargar la página no se abre el teclado.
- C3: tras registrarse, el invitado puede añadir al calendario, descargar la entrada y compartir.
- C4: al volver a abrir el link en el mismo dispositivo ve su entrada sin registrarse de nuevo.
- C5: ningún texto promete un pago que no existe.
- C6: en 360 × 640, con el teclado abierto, el botón de enviar es alcanzable.
