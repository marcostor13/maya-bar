# HU35 — Áreas seguras en pantallas fijas · Cierre

- **Cerrada:** 2026-11-22
- **Estado:** Terminada
- **Verificación (spec-verifier):** no ejecutado: el hook de context-mode modifica la llamada y el modo automático la rechaza. Autoverificación: 1 CUMPLE, 1 PARCIAL (C1 requiere dispositivo).
- **Commits:** sin commit (se integran al final del lote HU28–HU39)

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Llamada, editor de email y probador enteros con muesca | PARCIAL | `call-overlay.ts` (`top` + `--safe-top`, laterales); `email-editor.ts` (`.bar` y `.editor`); `ai-agents.ts` `.drawer` (padding arriba y abajo). **[usuario]**: prueba en un Android con muesca |
| C2 | En horizontal, el shell no queda bajo la muesca | CUMPLE | `shell.ts` `.main-content` `padding-left/right: var(--safe-left/right)` |

## Qué se implementó

- La tarjeta de llamada entrante, el editor de email y el probador de agentes suman las áreas seguras.
- En el móvil, el contenido del shell respeta la muesca a los lados en horizontal.
- Revisión de los elementos fijos:
  - Ya cumplían: toast, aviso sin conexión, `app-form-page`, scanner de check-in y landing.
  - Los modales centrados no lo necesitan.

## Lo que tiene que hacer el usuario

- Probar en un Android con muesca la llamada, el editor de email y el probador.

## Pruebas

- Frontend: `npx ng test frontend --watch=false` → 906/906 (95 archivos) · `npm run build` OK.

## Pendientes, riesgos y notas

- Ninguno.
