# HU32 — Diseñar la invitación con el dedo · Especificación

Historia: `backlog/hu32-disenador-invitacion-tactil.md` · Fecha: 2026-11-22 · Estado: aprobada

## Objetivo

Que el encargado pueda mover, redimensionar y editar los elementos de la invitación con el dedo, y verla como la verá el invitado.

## Usuarios

- **Encargado / gerente** que diseña desde el móvil o la tablet.

## Alcance

- **Incluye**:
  - Pointer Events para mover y redimensionar.
  - Doble toque para editar.
  - Asas más grandes en pantallas táctiles.
  - Escala del lienzo como en la landing.
  - Alto en `dvh`.
  - Propiedades en una hoja inferior.
  - Vista previa a pantalla completa.
- **No incluye**: gestos de pellizco ni rotación.

## Requisitos

- R1: `pointerdown/move/up/cancel` con `setPointerCapture`; `touch-action: none` en elementos y asas.
- R2: doble toque (< 350 ms) sobre texto o botón abre la edición.
- R3: escala = ancho útil / 324 en el móvil (como la landing); 1 en escritorio; en vista previa, cabe entero.
- R4: en el móvil, el alto del editor usa `dvh` y las propiedades van en una hoja al 46 % sin fondo que tape el lienzo.
- R5: botón "Vista previa" a pantalla completa; se cierra con X o Esc.

## Criterios de aceptación

- C1: con el dedo se mueve y redimensiona un texto, una imagen y el botón.
- C2: la invitación se ve al mismo tamaño relativo en el editor y en `/e/:slug` a 375 px.
- C3: a 360 × 640 no hay doble scroll y el lienzo sigue visible al editar propiedades.
