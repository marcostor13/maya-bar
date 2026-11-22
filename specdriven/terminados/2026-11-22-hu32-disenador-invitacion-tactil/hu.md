# HU32 — Diseñar la invitación con el dedo

## Historia

**Como** encargado que prepara la invitación desde el móvil o la tablet,
**quiero** mover y redimensionar los elementos con el dedo y ver la invitación tal como la verá el invitado,
**para** no depender de un ordenador para diseñarla.

## Contexto (estado actual)

Archivo: `pages/events/invitation-designer.ts`.

- **Arrastrar y redimensionar solo funciona con ratón**: `(mousedown)` en elementos y asas (l.768, l.807-810). No hay `pointer` ni `touch` events.
  - En el móvil no se puede mover nada en el lienzo.
- **La vista previa no coincide con la landing.**
  - En ≤ 480 px el lienzo se encoge con `transform: scale(0.88)` (l.2279).
  - La landing escala el mismo lienzo de 324 px al ancho de la pantalla (`public-event.ts` l.805), así que el invitado lo ve más grande que en el editor.
- **El editor tiene alto fijo**: 640 o 560 px (l.2213, l.2276), sin usar el alto real de la pantalla (`dvh`). En móviles pequeños queda cortado o con doble scroll.
- **Los paneles laterales** son cajones del 85-90 % del ancho (l.2236-2264): para cambiar una propiedad se tapa el lienzo entero.

## Propuesta

1. **Pointer Events** (`pointerdown`/`move`/`up` con `setPointerCapture`) para mover y redimensionar.
   - Asas de al menos 24 px visibles y `touch-action: none` en el lienzo mientras se arrastra.
   - Tocar fuera deselecciona.
2. **Escala del lienzo** calculada igual que en la landing (ancho disponible / 324), sin el 0.88 fijo.
3. **Alto del editor** con `dvh` (alto visible menos la cabecera) y un único scroll.
4. **En el móvil**, las propiedades del elemento seleccionado van en una hoja inferior a media altura, sobre la que se sigue viendo el lienzo, en lugar del cajón lateral.
5. **Botón "Vista previa"** que abre la invitación a pantalla completa, como en la landing.

## Supuestos

- En escritorio el comportamiento con ratón no cambia; Pointer Events lo cubre.

## Criterios de aceptación (borrador)

- C1: en un móvil táctil (o en la emulación táctil de Chrome) se mueve y redimensiona un texto, una imagen y el botón.
- C2: la invitación se ve al mismo tamaño relativo en el editor y en `/e/:slug` en 375 px.
- C3: en 360 × 640 el editor no tiene doble scroll y el lienzo sigue visible al editar propiedades.
