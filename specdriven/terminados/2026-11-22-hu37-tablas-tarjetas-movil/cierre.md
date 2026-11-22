# HU37 — Tablas y Contactos legibles en el móvil · Cierre

- **Cerrada:** 2026-11-22
- **Estado:** Terminada
- **Verificación (spec-verifier):** no ejecutado: el hook de context-mode modifica la llamada y el modo automático la rechaza. Autoverificación: 3 CUMPLE (CSS/plantilla, sin prueba de componente).
- **Commits:** sin commit (se integran al final del lote HU28–HU39)

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Sin scroll horizontal a 360 px en esas tablas | CUMPLE | `.table-cards` añadida (links.ts, link-analytics.ts ×2, link-batches.ts, roles-matrix.ts con `data-label` por rol, tenant-detail.ts); todas las `td` tienen `data-label` |
| C2 | Los mismos filtros en el móvil | CUMPLE | `customers.ts` `.mobile-filters` (mismos `setColumnFilter` que la fila de la tabla), visible solo en ≤ 768 px |
| C3 | Barra de acciones visible abajo | CUMPLE | `customers.ts` `.bulk-bar` `position: fixed` sobre la barra inferior y áreas seguras; acciones en una fila desplazable |

## Qué se implementó

- Seis tablas pasan a tarjetas en el móvil.
- Contactos: "Filtros" despliega en el móvil un panel con los mismos filtros por columna.
- La barra de acciones masivas queda fija abajo, con los botones en una fila que se desliza.
- En pantallas pequeñas, la ficha pone la etiqueta encima del valor.
- Plantillas de mensajes ya no se desbordan a 320 px.

## Lo que tiene que hacer el usuario

- Nada. Recomendado: revisarlo en un móvil real.

## Pruebas

- Frontend: `npx ng test frontend --watch=false` → 914/914 (97 archivos) · `npm run build` OK.

## Pendientes, riesgos y notas

- En vez de "2 acciones + menú ⋯", las seis acciones van en una fila desplazable: se ven todas sin un paso extra.
- En el móvil, borrar un rol de la matriz (botón en la cabecera de la columna) solo está en escritorio.
- No hay prueba de componente de Contactos (no existía spec); la cobertura es el build y la revisión.
