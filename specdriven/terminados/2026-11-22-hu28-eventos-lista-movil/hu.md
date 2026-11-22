# HU28 — Lista de eventos cómoda en el móvil

## Historia

**Como** encargado o impulsador que gestiona eventos desde el móvil,
**quiero** ver mis eventos al entrar, tocar una tarjeta para abrirla y compartir el link en un toque,
**para** no repetir pasos cada vez ni adivinar qué hace cada ícono.

## Contexto (estado actual)

Archivo: `frontend/src/app/pages/events/events.ts`.

- **Hay que elegir el local cada vez.** `selectedLocalId` empieza vacío (l.338) y la página arranca en "Selecciona un local" (l.70), aunque la empresa tenga un solo local.
- **Las acciones son solo íconos con `title`** (l.148-170). En táctil el `title` no se ve.
  - "Asistentes" (Users) y "Editar / IA" (Pencil) hacen lo mismo: `openEventDetail(ev)`.
  - Eliminar queda junto a los demás, sin separación.
- **La tarjeta no se puede tocar**: solo los íconos navegan. El enlace a la página pública mide unos 22 px (`.btn-icon-sm`, l.265).
- **Efectos de hover pensados para escritorio**: `translateY(-6px)` y zoom de la imagen (l.239, l.245). En táctil se quedan "pegados" tras tocar.
- **Compartir**:
  - El QR se pide a un servicio externo, `api.qrserver.com` (l.351). La URL del evento sale a un tercero y depende de él.
  - El `download` de una imagen de otro origen no descarga; abre una pestaña.
  - No usa el menú de compartir nativo (`navigator.share`), que en el móvil lleva directo a WhatsApp o Instagram.
- **Sin filtros**: no se pueden separar próximos, pasados y borradores, y no hay orden por fecha.
- **Reglas de estilo incumplidas**:
  - Colores fijos: `#fff` (l.238) y el aviso del borrador (l.280).
  - `.overlay` con `padding: 24px` (l.275), contra la regla de modales de CLAUDE.md.

## Propuesta

1. **Local**:
   - Si hay un solo local, se elige solo.
   - Si hay varios, se recuerda el último elegido en este dispositivo.
2. **Tarjeta**:
   - Toda la tarjeta abre el detalle.
   - Abajo quedan dos acciones con texto: "Compartir" y "Asistentes".
   - Lo demás va en un menú "⋯" con Editar, Ver página pública y Eliminar; Eliminar en rojo y con confirmación.
3. **Compartir**:
   - Se usa `navigator.share` cuando el móvil lo tenga; si no, el modal actual.
   - El QR se genera en el navegador con la librería `qrcode` que ya usa la landing, y "Descargar QR" baja un PNG de verdad.
4. **Filtro**: segmentado con Próximos (por defecto), Pasados y Borradores, ordenado por fecha (los próximos primero).
5. **Táctil y estilo**:
   - Los efectos de hover solo bajo `@media (hover: hover)`.
   - Zonas táctiles de al menos 44 px.
   - Colores con variables de `styles.scss`.
   - Overlay sin padding.
6. **Impulsador**: un botón "Compartir mi link", con texto y con `?ref=`, en lugar del ícono suelto.

## Supuestos

- "Recordar el local" se guarda en `localStorage`; no hace falta en el servidor.
- El orden y el filtro se hacen en el cliente; la lista de un local es pequeña.

## Criterios de aceptación (borrador)

- C1: con un solo local, al entrar se ven sus eventos sin elegir nada; con varios, aparece el último usado.
- C2: tocar la tarjeta abre el detalle; ninguna acción queda solo como ícono sin etiqueta o `aria-label` en 360 px.
- C3: "Compartir" abre el menú nativo cuando existe y, si no, el modal con el link y el QR generado en local; no hay peticiones a `api.qrserver.com`.
- C4: el filtro Próximos/Pasados/Borradores funciona y el orden es por fecha.
- C5: a 360 px no hay scroll horizontal y las zonas táctiles miden ≥ 44 px.
