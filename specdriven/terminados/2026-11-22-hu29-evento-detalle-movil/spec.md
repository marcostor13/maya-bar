# HU29 — Detalle del evento: guardar y moverse sin perderse en el móvil · Especificación

Historia: `backlog/hu29-evento-detalle-movil.md` · Fecha: 2026-11-22 · Estado: aprobada

## Objetivo

Hoy lo editado en Medios y Formulario solo se guarda con el botón de la pestaña General, y se pierde sin aviso al salir. En el móvil, las 9 pestañas no se ven. Se trata de que el encargado guarde desde cualquier pestaña, sepa si tiene cambios pendientes y llegue a cada pestaña sin buscarla.

## Usuarios

- **Encargado / gerente**: crea y edita eventos desde el móvil.

## Alcance

- **Incluye**:
  - Barra de guardado fija.
  - Detección de cambios y aviso al salir.
  - Pestañas agrupadas en el móvil.
  - Pestaña inicial según la fecha del evento.
  - Descripción editable.
  - Borrado de medios táctil con confirmación.
  - Formulario a ancho completo y reordenar preguntas.
- **Fuera de alcance**:
  - El guardado propio del diseñador de invitaciones (sigue como está).
  - Check-in y Asistentes (HU30 y HU31).

## Requisitos (EARS)

- **R1** — Mientras la pestaña activa sea General, Medios o Formulario (o Invitación en un evento nuevo), el sistema debe mostrar una barra fija abajo con el botón Guardar (Crear evento si es nuevo). Esa barra respeta `safe-area-inset-bottom`.
- **R2** — Cuando el título, la descripción, la fecha, las horas, el precio, la capacidad, el estado, la imagen, los medios o las preguntas difieran de lo último guardado, la barra debe mostrar "Cambios sin guardar".
- **R3** — Si el usuario sale del detalle con cambios sin guardar, entonces el sistema debe pedir confirmación con `ConfirmService` antes de salir. Sin cambios, no pregunta.
- **R4** — En pantallas ≤ 768 px, el sistema debe agrupar las pestañas en "Configurar" (General, Medios, Formulario, Invitación) y "Operar" (Asistentes, Check-in, Impulsadores, Estadísticas, Marketing IA), con un selector de grupo. Un evento nuevo solo muestra Configurar.
- **R5** — Cuando se abre un evento publicado sin `?tab=`, la pestaña inicial debe ser:
  - Check-in, si la fecha es hoy.
  - Asistentes, si es futura.
  - General, en cualquier otro caso.
- **R6** — La pestaña General debe permitir editar la descripción.
- **R7** — En Medios, el botón de borrar debe verse siempre en dispositivos táctiles, medir ≥ 36 px y pedir confirmación.
- **R8** — En Formulario, el tipo de pregunta debe ocupar el ancho completo en el móvil, las acciones deben medir ≥ 40 px en táctil y se deben poder subir y bajar preguntas.
- **R9 (no funcional)** — Sin colores fijos nuevos; se usan las variables de `styles.scss`.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1, R2 | Dado un evento cargado, cuando se añade una pregunta o un medio, entonces `dirty` es true y la barra muestra "Cambios sin guardar"; tras guardar, `dirty` es false | unitaria (store / detalle) |
| C2 | R3 | Dado `dirty`, cuando se intenta salir, entonces se pide confirmación; sin cambios, no | unitaria (guard) |
| C3 | R4 | En 360 px se llega a cualquier pestaña en ≤ 2 toques | unitaria (grupos) + revisión CSS |
| C4 | R5 | Un evento publicado de hoy abre en Check-in y uno futuro en Asistentes | unitaria (`initialTab`) |
| C5 | R6 | La descripción se edita en General y se envía al guardar | unitaria |
| C6 | R7 | El borrado de un medio pide confirmación; en táctil se ve y mide ≥ 36 px | unitaria + revisión CSS |
| C7 | R8 | Subir y bajar una pregunta cambia el orden | unitaria |

## Supuestos y decisiones por defecto

- "Hoy" se calcula con la fecha local del dispositivo frente a `date` (AAAA-MM-DD).
- Un evento nuevo empieza sin cambios; el aviso al salir aplica desde el primer cambio.
- La barra sustituye al bloque de botones de General.

## Preguntas abiertas

- Ninguna.
