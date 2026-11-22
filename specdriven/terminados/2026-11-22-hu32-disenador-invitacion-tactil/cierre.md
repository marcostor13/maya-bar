# HU32 — Diseñar la invitación con el dedo · Cierre

- **Cerrada:** 2026-11-22
- **Estado:** Terminada
- **Verificación (spec-verifier):** no ejecutado: el hook de context-mode modifica la llamada y el modo automático la rechaza. Autoverificación: 2 CUMPLE, 1 PARCIAL (C3 sin dispositivo real).
- **Commits:** sin commit (se integran al final del lote HU28–HU39)

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Mover y redimensionar con el dedo | CUMPLE | `invitation-designer.ts` `(pointerdown)`/`(pointermove)`, `document:pointerup/pointercancel`, `setPointerCapture`, `touch-action: none`, asas de 18 px con zona de toque de +8 px; doble toque (`isDoubleTap`); `designer-touch.spec.ts` |
| C2 | Mismo tamaño relativo que en la landing | CUMPLE | `canvasScaleFor`: en el móvil, ancho útil / 324, como `public-event.ts`; se quita `scale(0.88)`; spec |
| C3 | 360 × 640 sin doble scroll; lienzo visible al editar | PARCIAL | alto `calc(100dvh - 210px - nav)`, hoja `.d-props-sheet` al 46 % sin fondo que tape el lienzo (spec); falta probarlo en un móvil real |

## Qué se implementó

- **Interacción**: Pointer Events (ratón, dedo y lápiz) con captura de puntero.
  - Doble toque edita textos y botones.
  - Las asas son más grandes en pantallas táctiles.
- **Escala del lienzo**: la misma regla que la landing, aplicada con `zoom` y medida con `ResizeObserver`. El alto de la imagen se corrige según la escala.
- **Móvil**:
  - El editor usa el alto visible (`dvh`).
  - Las propiedades del elemento salen en una hoja inferior, sin fondo oscuro, y el lienzo de arriba se puede seguir arrastrando.
- **Vista previa**: botón "Vista previa" que muestra la invitación a pantalla completa, como la verá el invitado; se cierra con X o Esc.

## Lo que tiene que hacer el usuario

- Nada. Recomendado: probar en un móvil real a mover un texto, una imagen y el botón.

## Pruebas

- Frontend: `npx ng test frontend --watch=false` → 906/906 (95 archivos) · `npm run build` OK.

## Pendientes, riesgos y notas

- `zoom` requiere Firefox ≥ 126; en navegadores más viejos el lienzo queda a 324 px, como antes.
