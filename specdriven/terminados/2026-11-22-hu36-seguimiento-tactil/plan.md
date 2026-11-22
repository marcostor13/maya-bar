# HU36 — Seguimiento cómodo con el dedo · Plan técnico

## Diseño

- En el móvil, Seguimiento abre en lista; se recuerda la vista elegida.
- Cada tarjeta tiene "Mover", que abre una hoja inferior con las etapas. Al pasar a "Perdido" se sigue pidiendo confirmación.
- En el móvil el tablero encaja columna a columna.
- Los botones táctiles miden al menos 40 px y el buscador 16 px.

## Riesgos

- Cambios sobre todo de CSS: se verifican con el build y la suite completa.

## Pruebas

- Ver criterios en `cierre.md`.
