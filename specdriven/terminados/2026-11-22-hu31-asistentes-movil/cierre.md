# HU31 — Lista de asistentes legible en el móvil · Cierre

- **Cerrada:** 2026-11-22
- **Estado:** Terminada
- **Verificación (spec-verifier):** no ejecutado: el hook de context-mode modifica la llamada y el modo automático la rechaza. Autoverificación: 5 CUMPLE.
- **Commits:** sin commit (se integran al final del lote HU28–HU39)

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Lista compacta en el móvil que se despliega | CUMPLE | `tabs/event-registrations-tab.ts` (`isMobile`, `.reg-list`, `aria-expanded`); spec "móvil (HU31)" |
| C2 | "Ordenar por" en el móvil | CUMPLE | `onSortKey`, `SORT_OPTIONS` en `registrations-logic.ts`; spec |
| C3 | Llamar/WhatsApp con número normalizado | CUMPLE | `registrations-logic.ts` `waLink`/`telLink`; spec |
| C4 | Una sola petición tras 350 ms | CUMPLE | `onRegSearchChange` (ya existía); spec "debounce" |
| C5 | Toques ≥ 44 px y variables | CUMPLE | estilos `.reg-head` (56 px), `.reg-actions .btn` (44 px) y colores con variables |

## Qué se implementó

- En el móvil, tarjeta de dos renglones:
  - Nombre y chips (personas, estado, "Ingresó").
  - Debajo, impulsador y fecha.
- Al tocar se despliegan email, teléfono, ticket y respuestas, con Llamar, WhatsApp (`wa.me`) y Copiar email.
- Selector "Ordenar por" en el móvil.
- Buscador con `.input` (16 px en el móvil).
- En escritorio sigue la tabla.

## Lo que tiene que hacer el usuario

- Nada.

## Pruebas

- Frontend: `npx ng test frontend --watch=false` → 891/891 (93 archivos) · `npm run build` OK.

## Pendientes, riesgos y notas

- WhatsApp abre `wa.me`, no el chat de Conversaciones: no hay búsqueda de contacto por teléfono desde esta pestaña.
