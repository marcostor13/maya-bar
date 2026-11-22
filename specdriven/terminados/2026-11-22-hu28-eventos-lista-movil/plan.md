# HU28 — Lista de eventos en el móvil · Plan técnico

## Estado actual

`frontend/src/app/pages/events/events.ts`:
- `selectedLocalId` empieza vacío (l.338).
- Acciones solo con ícono (l.148-170).
- QR de `api.qrserver.com` (l.351).
- Hover sin condición (l.239, l.245).
- `.overlay` con padding (l.275).
- Colores fijos (l.238, l.280).

## Diseño

- **`events-filter.ts`** (puro): `filterEvents(events, filter, today)` y `pickLocal(locals, saved)`.
- **Componente**:
  - `filter` signal y `visible = computed(filterEvents(...))`.
  - Tarjeta con `(click)` / `(keydown.enter)` y `tabindex=0`.
  - Pie: "Compartir" + "Asistentes" (o "Compartir mi link") y un menú "⋯" (`openMenuId`, se cierra con clic fuera / Esc).
  - `share(ev)`: `navigator.share` o modal. QR con `import('qrcode')` → `toDataURL`.
- **CSS**: hover en `@media (hover: hover)`, variables, overlay sin padding, botones ≥ 44 px en ≤ 768 px.

## Seguridad

Sin cambios de API. Se elimina el envío de la URL a un tercero (QR local).

## Observabilidad

No aplica.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| `navigator.share` rechaza (el usuario cancela) | Se ignora `AbortError`; otros errores → modal |

## Estrategia de pruebas

- Unitarias: `events-filter` (filtro, orden, local) y el componente (autoselección, navegación, compartir nativo y modal).

## Fases

1. Única.

## ADRs

- No aplica.
