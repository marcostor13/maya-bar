# HU37 — Tablas y Contactos legibles en el móvil · Especificación

Historia: `backlog/hu37-tablas-tarjetas-movil.md` · Fecha: 2026-11-22 · Estado: aprobada

## Objetivo

Que las tablas no obliguen a desplazarse de lado y que Contactos se pueda usar entero desde el móvil.

## Requisitos

- R1: `.table-cards` en links, analítica de links (×2), lotes, matriz de roles y detalle de empresa.
- R2: Contactos — filtros por columna también en el móvil, ficha en una columna en ≤ 480 px y acciones masivas fijas abajo.
- R3: plantillas de mensajes con `minmax(min(300px, 100%), 1fr)`.

## Criterios de aceptación

- C1: Sin scroll horizontal a 360 px en esas tablas.
- C2: Los mismos filtros en el móvil.
- C3: Barra de acciones visible abajo.
