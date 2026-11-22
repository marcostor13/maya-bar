# HU33 — Plan técnico

## Diseño

- **Backend**: `Event.location?` (DTO con `MaxLength(200)`); `findPublicEvent` lee `Local` (`select('name address')`) y arma `venue`.
- **Frontend**: `public-event-utils.ts` (`buildIcs`, `googleCalendarUrl`, `mapsUrl`, `load/save/forgetTicket`, `ctaLabel`); `public-event.ts` con hoja de detalles, foco, Esc, acciones de éxito y `dvh`.

## Seguridad

`venue` solo expone nombre y dirección. El ticket guardado en el dispositivo es el mismo que ya ve el invitado.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| `localStorage` bloqueado | try/catch: sin recuerdo, sigue funcionando |
| Horario que cruza la medianoche | el fin pasa al día siguiente |

## Pruebas

- Backend: `venue` del local y `location` propio.
- Frontend: utilidades (.ics, Google, CTA), lugar/descripción, entrada recordada, autocompletado sin autofocus.
