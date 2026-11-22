# HU29 — Detalle del evento: guardar y moverse sin perderse en el móvil · Cierre

- **Cerrada:** 2026-11-22
- **Estado:** Terminada
- **Verificación (spec-verifier):** no ejecutado: el hook de context-mode modifica la llamada y el modo automático la rechaza. Autoverificación: 7 CUMPLE.
- **Commits:** sin commit (se integran al final del lote HU28–HU39)

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Cambios → "Cambios sin guardar"; guardar limpia | CUMPLE | `event-detail.store.ts` (`dirty`, `markSaved`); `event-detail.ts` `.save-bar`; `event-detail-hu29.spec.ts` |
| C2 | Salir con cambios pide confirmación | CUMPLE | `event-detail.ts` `canLeave`, `app.routes.ts` `canDeactivate`; spec "salir con cambios" |
| C3 | Cualquier pestaña en ≤ 2 toques en 360 px | CUMPLE | `event-tabs.ts` `TAB_GROUP`, segmentado `.tab-groups` y `.tab-other-group` en ≤ 768 px |
| C4 | Publicado hoy → Check-in; futuro → Asistentes | CUMPLE | `event-tabs.ts` `initialTab`; spec |
| C5 | Descripción editable y enviada | CUMPLE | `tabs/event-general-tab.ts` textarea; spec "guardar envía descripción" |
| C6 | Borrar medio: visible en táctil, 36 px, confirma | CUMPLE | `tabs/event-media-tab.ts` `@media (hover: none)`, `removeMedia`; spec |
| C7 | Subir/bajar preguntas | CUMPLE | `tabs/event-form-tab.ts` `moveUp`/`moveDown`, acciones de 40 px; spec |

## Qué se implementó

- Barra de guardado fija (sobre la barra inferior y el área segura) en General, Medios y Formulario, y en Invitación si el evento es nuevo. Muestra "Cambios sin guardar", "Todo guardado" o "Evento sin crear".
- Aviso al salir con cambios: guard de ruta y `beforeunload`.
- Pestañas agrupadas Configurar/Operar en el móvil. Pestaña inicial según la fecha del evento (`?tab=` sigue mandando).
- Descripción editable en General; se quitaron los botones propios de la pestaña y las pistas de "guardar desde General".
- Borrado de medios con confirmación y visible en táctil; acciones del constructor de 40 px; colores con variables.

## Lo que tiene que hacer el usuario

- Nada.

## Pruebas

- `npx ng test frontend --watch=false` → 879/879 (92 archivos) antes de añadir el test de reordenar; `event-detail-hu29.spec.ts` → 8/8.
- `npm run build` (frontend) → OK; solo el aviso de presupuesto de `inbox.ts`, que ya existía.
- Backend: no se tocó en esta historia.

## Pendientes, riesgos y notas

- El diseñador de invitación sigue guardando por su cuenta (botón propio).
- "Hoy" usa el reloj del dispositivo.
