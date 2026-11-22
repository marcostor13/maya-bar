# HU34 — Modales que caben en el móvil · Especificación

Historia: `backlog/hu34-modales-altura-movil.md` · Fecha: 2026-11-22 · Estado: aprobada

## Objetivo

Que ningún modal ni panel quede cortado por la barra del navegador o el teclado en el móvil.

## Alcance

- **Incluye**:
  - Respaldo `dvh` en todas las alturas en `vh` del frontend.
  - Clase global `.modal-card`, documentada en kitui.
- **No incluye**:
  - Migrar los 38 `.overlay` locales a `.modal-card`.
  - `interactive-widget`: cambia el comportamiento de todo el shell; queda como nota.

## Requisitos

- R1: cada `height`/`min-height`/`max-height` en `vh` va seguida del mismo valor en `dvh`.
- R2: `.modal-card` global: `max-height` en `dvh` menos las áreas seguras, scroll interno y `.modal-actions` fijo abajo.
- R3: documentado en `docs/kitui.md`.

## Criterios de aceptación

- C1: ningún modal ni panel usa `100vh` o `90vh` sin `dvh`.
- C2: en 360 × 640 con el teclado se ven el campo del probador, el enviar de la plantilla y el guardar del diálogo de usuario.
- C3: `.modal-card` documentada en `docs/kitui.md`.
