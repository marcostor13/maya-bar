# HU39 — Inputs sin zoom, puntos de corte y Configuración navegable · Cierre

- **Cerrada:** 2026-11-22
- **Estado:** Terminada
- **Verificación (spec-verifier):** no ejecutado: el hook de context-mode modifica la llamada y el modo automático la rechaza. Autoverificación: 3 CUMPLE.
- **Commits:** sin commit (se integran al final del lote HU28–HU39)

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Ningún input < 16 px a 375 px | CUMPLE | `styles.scss` regla global `!important`; `settings-hu39.spec.ts` C1 |
| C2 | Entre 769 y 968 px, padding de móvil | CUMPLE | `styles.scss` `@media (min-width: 769px) and (max-width: 968px)`; spec C2; `docs/kitui.md` "Puntos de corte" |
| C3 | Llegar a cualquier sección en un toque | CUMPLE | `settings.ts` `.cfg-index` con 10 chips, `goTo` (`scrollIntoView`), `position: sticky` en ≤ 968 px; `max-width: 900px` quitado |

## Qué se implementó

- Una sola regla global en lugar de tocar archivo por archivo: cubre las páginas citadas y cualquier input futuro.
- Padding de móvil desde que aparece la barra inferior (968 px).
- Configuración tiene un índice de 10 secciones, fijo bajo la cabecera en el móvil, y la página ocupa todo el ancho.

## Lo que tiene que hacer el usuario

- Nada. Recomendado: revisarlo en un móvil real.

## Pruebas

- Frontend: `npx ng test frontend --watch=false` → 914/914 (97 archivos) · `npm run build` OK.

## Pendientes, riesgos y notas

- Los cortes sueltos (1100, 900, 720…) siguen en sus páginas; la guía de kitui pide no añadir más.
