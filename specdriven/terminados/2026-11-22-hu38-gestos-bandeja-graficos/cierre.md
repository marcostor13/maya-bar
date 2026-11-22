# HU38 — Gestos en la bandeja y gráficos táctiles · Cierre

- **Cerrada:** 2026-11-22
- **Estado:** Terminada
- **Verificación (spec-verifier):** no ejecutado: el hook de context-mode modifica la llamada y el modo automático la rechaza. Autoverificación: 3 CUMPLE.
- **Commits:** sin commit (se integran al final del lote HU28–HU39)

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Pulsación larga abre Responder/Copiar; desplazar no la dispara | CUMPLE | `shared/long-press.ts`; `inbox.ts` `(appLongPress)`, `msgMenu`, `copyMsg`; `long-press.spec.ts` (3 casos) |
| C2 | Pestañas de canal no se desbordan y miden ≥ 40 px | CUMPLE | `inbox.ts` `.channel-tabs` `overflow-x: auto`, `.channel-tab` `min-height: 40px`, `max-width` y `text-overflow` |
| C3 | Tocar un punto del gráfico muestra su valor | CUMPLE | `charts.ts` `(pointerdown)`, `onLeave` solo con ratón y cierre al tocar fuera; heatmap `(pointerdown)`; `long-press.spec.ts` "C3" |

## Qué se implementó

- Directiva `appLongPress`, reutilizable.
- En la bandeja, mantener pulsado un mensaje abre una hoja con Responder y Copiar texto. El botón de responder también es más grande en pantallas táctiles.
- Pestañas de canal desplazables, de 40 px de alto y con el texto recortado.
- Gráficos: el valor se fija al tocar y se cierra al tocar fuera.
- Los botones de periodo del dashboard miden al menos 40 px.

## Lo que tiene que hacer el usuario

- Nada. Recomendado: revisarlo en un móvil real.

## Pruebas

- Frontend: `npx ng test frontend --watch=false` → 914/914 (97 archivos) · `npm run build` OK.

## Pendientes, riesgos y notas

- Plegar canal y cuenta dentro de "Filtros" en el móvil no se hizo: con las pestañas desplazables ya no se desbordan.
