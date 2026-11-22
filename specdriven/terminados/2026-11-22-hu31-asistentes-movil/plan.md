# HU31 — Asistentes en el móvil · Plan técnico

## Estado actual

`frontend/src/app/pages/events/tabs/event-registrations-tab.ts`:
- En ≤ 768 px, la tabla pasa a tarjetas de 9 filas (l.193-215) y `thead` se oculta junto con el orden (l.201).
- El teléfono es texto plano.
- El buscador no usa `.input` (l.158, 14 px).
- Ya hay debounce de 350 ms (l.237-241).

## Diseño

- **`registrations-logic.ts`**: `waLink(phone)`, `telLink(phone)`, `SORT_OPTIONS` y `sortKey`/`parseSortKey`.
- **Componente**:
  - `isMobile` signal con `matchMedia('(max-width: 768px)')` y su listener (se quita en `ngOnDestroy`).
  - Escritorio: la tabla de siempre.
  - Móvil: `<ul class="reg-list">` de tarjetas (`<button>` con `aria-expanded`) y detalle con las acciones.
  - Select "Ordenar por" visible solo en el móvil.
  - Buscador con `.input`.
- **CSS**: se quita la transformación de la tabla en el móvil; colores con variables.

## Seguridad

Sin cambios de API. Enlaces `tel:`/`wa.me` con `rel="noopener"`.

## Observabilidad

No aplica.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| `matchMedia` no existe (SSR/pruebas) | Comprobación defensiva (false) |

## Estrategia de pruebas

- Unitarias: `waLink`, orden, lista móvil y expansión.

## Fases

1. Única.

## ADRs

- No aplica.
