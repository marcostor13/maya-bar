# HU29 — Detalle del evento: guardar y moverse sin perderse en el móvil

## Historia

**Como** encargado que crea o edita un evento desde el móvil,
**quiero** un botón de guardar siempre visible y pestañas fáciles de recorrer,
**para** no perder lo que subí o configuré por no encontrar dónde guardar.

## Contexto (estado actual)

Archivos: `pages/events/event-detail.ts`, `event-detail.store.ts` y `tabs/*`.

- **Solo se guarda desde la pestaña General.**
  - Los cambios de Medios, Formulario e Invitación quedan en memoria (`mediaFiles`, `formFields`, `design` del store).
  - Solo se guardan con "Actualizar evento" (`event-general-tab.ts` l.64-70 y `saveEvent` en `event-detail.store.ts` l.135).
  - En el móvil, quien sube fotos en Medios tiene que volver a General a guardar; si sale antes, lo pierde sin aviso.
  - No hay aviso de cambios sin guardar.
- **Nueve pestañas en una barra horizontal** (`event-detail.ts` l.86-133). En 360 px se ven unas tres y no se sabe que hay más; solo un degradado lo insinúa.
  - Además mezclan configurar (General, Medios, Formulario, Invitación) con operar el día del evento (Asistentes, Check-in, Impulsadores, Estadísticas, Marketing IA).
- **La descripción no se edita a mano**: el formulario tiene `description` (store l.101), pero la pestaña General no lo muestra; solo la rellena "Marketing IA".
- **Medios**:
  - El botón de borrar está oculto hasta el hover (`event-media-tab.ts` l.100-101: `opacity: 0`) y mide 24 px. En táctil no se ve.
  - Borra sin confirmar.
- **Formulario**:
  - El tipo de pregunta tiene `style="width:160px"` en línea (`event-form-tab.ts` l.96).
  - Los botones de acción `.btn-icon-xs` son pequeños para el dedo.
- **Abrir un evento publicado** lleva siempre a General, aunque sea el día del evento y lo útil sea Check-in o Asistentes.

## Propuesta

1. **Barra de guardado fija** abajo (con `safe-area-inset-bottom`), visible en General, Medios, Formulario e Invitación.
   - Muestra "Cambios sin guardar" cuando hay diferencias y un botón "Guardar" (o "Crear evento").
   - El botón actual de la pestaña General desaparece.
2. **Aviso al salir con cambios** (atrás, otra ruta) con `ConfirmService`.
3. **Pestañas en dos grupos** en el móvil: un segmentado "Configurar / Operar" y, debajo, solo las pestañas de ese grupo.
   - En escritorio todo sigue igual.
   - Pestaña inicial:
     - Evento publicado de hoy: Check-in.
     - Evento publicado futuro: Asistentes.
     - Resto: General.
     - `?tab=` sigue mandando.
4. **Descripción** editable (textarea) en General.
5. **Medios**: borrar siempre visible en táctil, de al menos 36 px y con confirmación.
6. **Formulario**: tipo de pregunta a ancho completo en el móvil, acciones de al menos 40 px y reordenar con subir/bajar.

## Supuestos

- "Cambios sin guardar" se calcula comparando con lo último guardado (form + medios + campos + diseño).
- El diseñador de la invitación sigue guardando su diseño por su cuenta donde ya lo hace; la barra solo cubre lo que hoy depende de `saveEvent`.

## Criterios de aceptación (borrador)

- C1: tras subir un medio o añadir una pregunta, sin cambiar de pestaña, la barra muestra "Cambios sin guardar" y "Guardar" persiste todo.
- C2: salir con cambios sin guardar pide confirmación; sin cambios, no.
- C3: a 360 px se llega a cualquier pestaña en ≤ 2 toques y sin scroll horizontal oculto.
- C4: un evento publicado de hoy abre en Check-in.
- C5: la descripción se edita en General y se guarda.
- C6: en táctil el borrado de un medio se ve, mide ≥ 36 px y pide confirmación.
