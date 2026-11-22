# HU28 — Lista de eventos cómoda en el móvil · Especificación

Historia: `backlog/hu28-eventos-lista-movil.md` · Fecha: 2026-11-22 · Estado: aprobada

## Objetivo

Hoy, en el móvil, hay que elegir el local en cada visita, las acciones son íconos sin texto y compartir pasa por un servicio de QR externo. Se trata de que el encargado o el impulsador vean sus eventos al entrar y los compartan en un toque.

## Usuarios

- **Encargado / gerente**: abre, comparte y gestiona eventos.
- **Impulsador**: comparte su link con `?ref=`.

## Alcance

- **Incluye**:
  - Local recordado.
  - Tarjeta tocable con acciones con texto y menú "⋯".
  - Compartir nativo y QR generado en el propio navegador.
  - Filtro Próximos/Pasados/Borradores.
  - Estilos táctiles.
- **Fuera de alcance**: cambios en la API.

## Requisitos (EARS)

- **R1** — Cuando la empresa tiene un solo local, el sistema debe seleccionarlo al entrar. Si tiene varios, debe seleccionar el último usado en el dispositivo (si sigue existiendo).
- **R2** — Cuando se toca una tarjeta (o se pulsa Enter sobre ella), el sistema debe abrir el detalle del evento.
- **R3** — Cada tarjeta debe mostrar las acciones con texto:
  - Encargado: "Compartir" y "Asistentes"; Editar, Ver página pública y Eliminar en un menú "⋯".
  - Impulsador: "Compartir mi link".
- **R4** — Cuando se pulsa Compartir y el navegador tiene `navigator.share`, el sistema debe abrir el menú nativo con el título y la URL. Si no, debe abrir el modal con el link y un QR generado en el navegador, que se puede descargar como PNG.
- **R5** — El sistema debe ofrecer el filtro Próximos (por defecto), Pasados y Borradores, con orden por fecha: próximos de antes a después y pasados del más reciente al más antiguo.
- **R6 (privacidad)** — El sistema no debe enviar la URL del evento a servicios externos para generar el QR.
- **R7 (no funcional)** — Hover solo con `(hover: hover)`, zonas táctiles ≥ 44 px en el móvil, colores con variables y `.overlay` sin padding.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | Con un local se cargan sus eventos sin elegir; con dos, se usa el guardado | unitaria |
| C2 | R2, R3 | Tocar la tarjeta navega al detalle; "Asistentes" abre `?tab=registrations` | unitaria |
| C3 | R4, R6 | Con `navigator.share` se llama con la URL; sin él se abre el modal con un QR `data:`; sin peticiones a `api.qrserver.com` | unitaria + grep |
| C4 | R5 | Próximos/Pasados/Borradores filtran y ordenan | unitaria (función pura) |
| C5 | R7 | En 360 px sin scroll horizontal y toques ≥ 44 px | revisión CSS |

## Supuestos y decisiones por defecto

- "Próximos" = no borrador con fecha ≥ hoy (incluye cancelados, que se ven con su estado).
- El local se guarda en `localStorage` (`maya.events.localId`).

## Preguntas abiertas

- Ninguna.
