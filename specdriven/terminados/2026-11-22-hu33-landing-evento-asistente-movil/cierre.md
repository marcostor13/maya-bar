# HU33 — Landing del evento cómoda para el invitado en el móvil · Cierre

- **Cerrada:** 2026-11-22
- **Estado:** Terminada
- **Verificación (spec-verifier):** no ejecutado: el hook de context-mode modifica la llamada y el modo automático la rechaza. Autoverificación: 5 CUMPLE, 1 PARCIAL (C6 sin prueba en dispositivo real).
- **Commits:** sin commit (se integran al final del lote HU28–HU39)

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Descripción, fecha, hora y lugar con "Cómo llegar" | CUMPLE | `events.service.ts` `venue`; `public-event.ts` `.pe-venue`, `.pe-description`, hoja "Detalles"; `public-event-hu33.spec.ts` C1; `events.service.spec.ts` HU33 |
| C2 | Autocompletado; sin teclado al cargar | CUMPLE | `autocomplete` name/email/tel, `inputmode`, `enterkeyhint`, sin `autofocus`; foco al abrir (`openForm`); spec C2 |
| C3 | Calendario, descargar entrada y compartir | CUMPLE | `addToCalendar` (.ics), `googleCalUrl`, `saveTicketImage` (PNG), `inviteFriend` (conserva `?ref=`); utils spec |
| C4 | Vuelve y ve su entrada | CUMPLE | `saveTicket`/`restoreSavedTicket` (`maya.ticket.<id>`); "Registrar a otra persona"; spec C4 ×2 |
| C5 | Sin promesa de pago | CUMPLE | `ctaLabel` "Reservar…"; nota "se paga en el local"; spec C5 |
| C6 | 360 × 640 con teclado: botón alcanzable | PARCIAL | hoja `max-height: 92dvh`, `overflow-y: auto`, `overscroll-behavior: contain`; falta comprobarlo en un móvil real |

## Qué se implementó

- **Backend**:
  - `Event.location` opcional (máx. 200).
  - El endpoint público devuelve `venue`: el nombre y la dirección del local, o el lugar propio del evento si existe. Nada más del local.
- **Formulario del evento**: campo "Lugar (opcional)".
- **Landing**:
  - Sin diseño: descripción y lugar con "Cómo llegar" (Google Maps).
  - Con diseño: botón "Detalles", que abre una hoja con lo mismo.
- **Formulario**:
  - Autocompletado y teclados adecuados.
  - El foco va al nombre solo al abrir la hoja.
  - Esc cierra y el foco queda atrapado dentro.
  - `role="dialog"` e `inert` cuando está cerrada.
- **Tras registrarse**:
  - Añadir al calendario (.ics) o a Google Calendar.
  - Guardar la entrada como PNG.
  - Cómo llegar.
  - Invitar a un amigo: menú nativo o copia el link con el mismo `?ref=`.
- **Entrada recordada**: se guarda en el dispositivo; al volver se muestra "Ya estás registrado" y se puede registrar a otra persona.
- **Textos**: "Reservar mi lugar" o "Reservar entrada · S/ X", con la nota de pago en el local.
- **Alturas**: en `dvh`.

## Lo que tiene que hacer el usuario

- Nada. Opcional: rellenar "Lugar" en los eventos que no son en el local.

## Pruebas

- Backend: `npm run build` OK · `npm test` → 1693/1693 (125 suites).
- Frontend: `npx ng test frontend --watch=false` → 899/899 (94 archivos) · `npm run build` OK.

## Pendientes, riesgos y notas

- La entrada recordada vive en el `localStorage` del navegador; si el invitado borra los datos, ya no la ve, pero la tiene en su correo.
- C6 queda por probar con el teclado real de Android e iOS.
