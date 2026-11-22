# HU39 — Inputs sin zoom, puntos de corte y Configuración navegable · Plan técnico

## Diseño

- Una sola regla global en lugar de tocar archivo por archivo: cubre las páginas citadas y cualquier input futuro.
- Padding de móvil desde que aparece la barra inferior (968 px).
- Configuración tiene un índice de 10 secciones, fijo bajo la cabecera en el móvil, y la página ocupa todo el ancho.

## Riesgos

- Cambios sobre todo de CSS: se verifican con el build y la suite completa.

## Pruebas

- Ver criterios en `cierre.md`.
