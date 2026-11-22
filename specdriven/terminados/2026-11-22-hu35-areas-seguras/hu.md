# HU35 — Nada fijo debajo de la muesca ni de la barra de estado

## Historia

**Como** usuario de la app Android (pantalla de borde a borde) o del iPhone,
**quiero** que la llamada entrante y las pantallas completas respeten la muesca y las barras del sistema,
**para** poder ver quién llama y tocar contestar sin que nada quede tapado.

## Contexto (estado actual)

- **La tarjeta de llamada entrante** tiene `top: 20px` y, en el móvil, `top: 12px`, sin `--safe-top` (`shared/calls/call-overlay.ts:126, 154`). Con targetSdk 36 la app dibuja bajo la barra de estado.
- **El editor de email** (`templates/email-editor.ts:343-345`, `.bar`) y **el probador de agentes** (`ai-agents.ts:844-846`) son pantallas fijas sin área segura arriba.
- **`.main-content` no suma `--safe-left`/`--safe-right`** con el móvil en horizontal (`layout/shell/shell.ts:513-519`).

## Propuesta

1. Sumar `var(--safe-top)` en los elementos fijos de arriba y `var(--safe-bottom)` en los de abajo.
2. Sumar `--safe-left` y `--safe-right` en el shell.
3. Revisar con `grep "position: fixed"` cualquier otro elemento fijo y anotar los que se dejan como están.

## Criterios de aceptación (borrador)

- C1: en un Android con muesca, la tarjeta de llamada, el editor de email y el probador se ven enteros. **[usuario]** para la prueba en el dispositivo.
- C2: en horizontal, el contenido del shell no queda bajo la muesca.
