# HU35 — Plan técnico

- Sumar `var(--safe-*)` (definidas en `styles.scss`) a los `top`, `padding` y márgenes de `call-overlay.ts`, `email-editor.ts`, `ai-agents.ts` (`.drawer`) y `shell.ts` (`.main-content`).
- Revisión de `position: fixed`:
  - Ya lo cumplen: `toast`, `offline-banner`, `form-page`, el scanner de check-in y la landing.
  - Los modales centrados con `.overlay` no lo necesitan: la tarjeta va centrada.
- **Pruebas**: build y la suite completa (es un cambio solo de CSS).
