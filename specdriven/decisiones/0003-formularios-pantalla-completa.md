# 0003 — Formularios de crear/editar a pantalla completa con `app-form-page`

- **Fecha:** 2026-11-12 · **Estado:** aceptada
- **Historia:** hu9

## Contexto

Los formularios de alta/edición vivían en paneles laterales de 480–600 px,
con CSS copiado en cada página. Los usuarios no ven bien los campos largos.
La historia propone rutas `/…/nuevo` y `/…/:id/editar`.

## Decisión

Un componente común `app-form-page` (`frontend/src/app/shared/form-page.ts`)
que cubre toda la pantalla, se muestra con `@if` desde la propia página y
gestiona barra superior, `?form=<clave>` en la URL (atrás del navegador
cierra), ESC y la confirmación de cambios sin guardar. Los modales simples
(≤ 5 campos) siguen siendo modales.

## Alternativas consideradas

- Rutas propias con componentes separados — exige sacar el estado del
  formulario de ~20 páginas a componentes nuevos y duplicar la carga de
  datos auxiliares (cuentas, etapas, listas); alto riesgo de regresiones para
  el mismo resultado visual. Queda como evolución si algún formulario necesita
  enlace directo.
- Ensanchar los drawers — no resuelve la falta de espacio en móvil ni el
  botón atrás.

## Consecuencias

- Positivas: patrón único y accesible; atrás del navegador funciona; el
  listado conserva su estado; menos CSS duplicado.
- Negativas / costes: recargar con `?form=` abre el listado, no el formulario;
  no hay enlace directo a "editar X".
