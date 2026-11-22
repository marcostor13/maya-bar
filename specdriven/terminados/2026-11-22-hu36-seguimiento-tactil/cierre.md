# HU36 — Seguimiento cómodo con el dedo · Cierre

- **Cerrada:** 2026-11-22
- **Estado:** Terminada
- **Verificación (spec-verifier):** no ejecutado: el hook de context-mode modifica la llamada y el modo automático la rechaza. Autoverificación: 3 CUMPLE.
- **Commits:** sin commit (se integran al final del lote HU28–HU39)

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | En 360 px abre en lista | CUMPLE | `leads-view.ts` `initialLeadsView`; `leads.ts` `setView`; `leads.spec.ts` "C1" |
| C2 | Cambiar la etapa sin arrastrar y que se guarde | CUMPLE | `openMoveSheet`/`pickStage` → `moveTo` (PATCH `/leads/:id/move`); spec "C2" |
| C3 | Toques ≥ 40 px y buscador sin zoom | CUMPLE | `@media (pointer: coarse), (max-width: 768px)` en `leads.ts`; `.search-input` 16 px |

## Qué se implementó

- En el móvil, Seguimiento abre en lista; se recuerda la vista elegida.
- Cada tarjeta tiene "Mover", que abre una hoja inferior con las etapas. Al pasar a "Perdido" se sigue pidiendo confirmación.
- En el móvil el tablero encaja columna a columna.
- Los botones táctiles miden al menos 40 px y el buscador 16 px.

## Lo que tiene que hacer el usuario

- Nada. Recomendado: revisarlo en un móvil real.

## Pruebas

- Frontend: `npx ng test frontend --watch=false` → 914/914 (97 archivos) · `npm run build` OK.

## Pendientes, riesgos y notas

- El arrastre HTML5 sigue en escritorio.
