# HU36 — Seguimiento (oportunidades) usable con el dedo

## Historia

**Como** vendedor que mueve sus oportunidades desde el móvil,
**quiero** cambiar la etapa de una oportunidad sin arrastrar y con botones que pueda tocar bien,
**para** mantener mi embudo al día desde la calle.

## Contexto (estado actual)

Archivo: `pages/leads/leads.ts`.

- **El tablero es la vista por defecto** (l.901), con columnas de 268 px (l.722); en 360 px se ve una columna y un poco de la siguiente.
- **Mover una oportunidad depende del arrastre HTML5** (`draggable`/`dragstart`, l.286-288). No es fiable con el dedo y menos aún en el WebView de Android.
- **La alternativa son chips de etapa** de unos 28 px dentro de la ficha (l.788).
- **Botones pequeños**: los de vista miden 34 × 30 (l.700) y "Tomar", unos 22 px (l.750).
- **El buscador mide 13.5 px** (l.717): iOS hace zoom.

## Propuesta

1. **Por debajo de 768 px, la vista por defecto es la lista**; el tablero sigue disponible y se recuerda la elección.
2. **"Mover a…"** en cada tarjeta, como hoja inferior con las etapas, para el móvil y como alternativa al arrastre.
3. **Tablero con `scroll-snap`** por columna en el móvil.
4. **Toques de al menos 40 px** en chips de etapa, "Tomar" y botones de vista; buscador a 16 px.

## Criterios de aceptación (borrador)

- C1: en 360 px, Seguimiento abre en la vista de lista.
- C2: se cambia la etapa de una oportunidad desde el móvil sin arrastrar, y queda guardado.
- C3: chips, "Tomar" y botones de vista miden ≥ 40 px; el buscador no hace zoom en iOS.
