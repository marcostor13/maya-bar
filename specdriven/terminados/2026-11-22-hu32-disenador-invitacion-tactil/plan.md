# HU32 — Plan técnico

## Diseño

- **`designer-touch.ts`**: `canvasScaleFor(w, h, preview)` e `isDoubleTap`.
- **`invitation-designer.ts`**:
  - `(mousedown)` → `(pointerdown)` y `(mousemove)` → `(pointermove)`.
  - `document:pointerup` y `pointercancel`.
  - `setPointerCapture`.
  - `ResizeObserver` sobre `.d-stage` → `canvasScale`, aplicado con `zoom` (ocupa su espacio real, sin hueco).
  - `previewing`.
  - Hoja `.d-props-sheet`.
  - Se quita `scale(0.88)` y los altos fijos.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| `zoom` en navegadores antiguos | Chrome, Safari y Firefox ≥ 126 lo soportan; sin él, el lienzo queda a 324 px (como antes) |
| El arrastre de la imagen en px con zoom | `dy` se divide por la escala |

## Pruebas

- Unitarias de escala y doble toque.
- Arrastre con eventos de puntero.
- Hoja sin fondo.
- Vista previa con Esc.
