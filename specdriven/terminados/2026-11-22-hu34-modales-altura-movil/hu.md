# HU34 — Modales y paneles que caben en la pantalla del móvil

## Historia

**Como** usuario de Maya en el móvil (web o app Android),
**quiero** que los modales y paneles quepan en la pantalla visible, también con el teclado abierto,
**para** poder llegar siempre al campo de texto y a los botones de guardar.

## Contexto (estado actual)

- **Usan `100vh`/`90vh`**, que en el móvil incluye la barra del navegador:
  - `ai-agents/ai-agents.ts:844`: probador de agentes; el campo del chat queda abajo (l.933).
  - `inbox/inbox.ts:2146` (ficha de contacto) y `:2196` (visor de imágenes).
  - `inbox/wa-template-picker.ts:120`.
  - `integrations.ts:441`, `email-templates.ts:214`, `user-dialog.styles.ts:6`, `lead-assign.ts:70`, `push-center.ts:97`.
  - `campaign-editor.ts:726/741`.
- **No hay una clase de modal común**: existen 38 `.overlay` locales, cada uno con su propia `max-height` o sin ella (`lead-stages-config.ts:177` no la tiene).

## Propuesta

1. **Clase global `.modal-card`** en `styles.scss`:
   - `max-height: calc(100dvh - 32px - var(--safe-top) - var(--safe-bottom))`.
   - Scroll interno y pie de acciones fijo dentro de la tarjeta.
   - Documentarla en `docs/kitui.md`.
2. **Sustituir `vh` por `dvh`** (con `vh` de respaldo) en los archivos de arriba y usar `.modal-card` en los modales tocados.
3. **`interactive-widget=resizes-content`** en el viewport, si no rompe el shell, para que el teclado reduzca el área visible.

## Criterios de aceptación (borrador)

- C1: ningún modal ni panel usa `100vh` o `90vh` sin `dvh`.
- C2: en 360 × 640, con el teclado abierto, se ven el campo del probador de agentes, el botón de enviar de la plantilla y el guardar del diálogo de usuario.
- C3: `.modal-card` está documentada en `docs/kitui.md`.
