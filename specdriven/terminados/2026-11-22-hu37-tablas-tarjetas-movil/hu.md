# HU37 — Tablas en tarjetas y filtros de Contactos en el móvil

## Historia

**Como** usuario que consulta links, contactos y administración desde el móvil,
**quiero** ver cada fila como una tarjeta y poder filtrar como en escritorio,
**para** no desplazarme de lado ni perder funciones.

## Contexto (estado actual)

- **Tablas con `data-label` pero sin la clase `.table-cards`** (definida en `styles.scss:439`), por lo que solo se desplazan de lado:
  - `links/links.ts:98-101` (7 columnas).
  - `link-analytics.ts:147/178`, `link-batches.ts:67`, `roles-matrix.ts:57`, `admin/tenant-detail.ts:212`.
- **Contactos**:
  - En el móvil se ocultan los filtros por columna (`.filter-row { display:none }`, `customers.ts:1210`) sin ninguna alternativa.
  - La ficha usa `grid-template-columns: 150px 1fr` (l.1097), que deja poco espacio al valor.
  - La barra de acciones masivas apila 6 botones y no queda fija (l.1201-1203).
- **`message-templates.ts:205`**: `minmax(300px,1fr)` se desborda en 320 px.

## Propuesta

1. **Añadir `.table-cards`** a las tablas de arriba (y comprobar que cada `td` tiene `data-label`).
2. **Contactos**:
   - Botón "Filtros" que abre una hoja inferior con los mismos filtros por columna.
   - Ficha en una sola columna (etiqueta encima del valor) por debajo de 480 px.
   - Acciones masivas en una barra fija abajo: las 2 principales más un menú "⋯".
3. **`minmax(min(300px, 100%), 1fr)`** en plantillas de mensajes.

## Criterios de aceptación (borrador)

- C1: a 360 px, links, analítica, lotes, matriz de roles y detalle de empresa no tienen scroll horizontal.
- C2: en Contactos se pueden aplicar en el móvil los mismos filtros que en escritorio.
- C3: con contactos seleccionados, la barra de acciones queda visible abajo.
