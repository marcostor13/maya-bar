# HU34 — Modales que caben en el móvil · Cierre

- **Cerrada:** 2026-11-22
- **Estado:** Terminada
- **Verificación (spec-verifier):** no ejecutado: el hook de context-mode modifica la llamada y el modo automático la rechaza. Autoverificación: 2 CUMPLE, 1 PARCIAL (C2 sin dispositivo real).
- **Commits:** sin commit (se integran al final del lote HU28–HU39)

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Ningún `vh` sin `dvh` | CUMPLE | 18 archivos con el par `vh` → `dvh` (ai-agents, inbox, wa-template-picker, integrations, email-templates, user-dialog, lead-assign, push-center, campaign-editor, settings, mis-asistentes, prospecting, email-compose, invitation-designer, públicas); grep: toda altura en `vh` va seguida de su `dvh` |
| C2 | Probador, plantilla y diálogo de usuario visibles con el teclado | PARCIAL | `.drawer` del probador `100dvh`; `wa-template-picker` y `user-dialog` `max-height` en `dvh`; falta probarlo con el teclado real |
| C3 | `.modal-card` documentada | CUMPLE | `styles.scss` `.modal-card`; `docs/kitui.md` "Modales: `.modal-card` y alturas en `dvh`" |

## Qué se implementó

- Cada altura en `vh` del frontend tiene detrás su versión en `dvh`: el alto visible real, sin la barra del navegador.
- Clase global `.modal-card`:
  - Alto máximo visible menos las áreas seguras, con scroll interno.
  - Un `.modal-actions` hijo queda pegado abajo.
- La regla queda documentada en kitui.

## Lo que tiene que hacer el usuario

- Nada.

## Pruebas

- Frontend: `npx ng test frontend --watch=false` → 906/906 (95 archivos) · `npm run build` OK.

## Pendientes, riesgos y notas

- `interactive-widget=resizes-content` no se aplicó: cambia el comportamiento de todo el shell con el teclado y merece prueba en un dispositivo antes.
- Los 38 `.overlay` locales siguen con sus propias tarjetas; las nuevas deberían usar `.modal-card`.
