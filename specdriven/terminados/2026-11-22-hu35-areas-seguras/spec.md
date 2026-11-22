# HU35 — Áreas seguras en pantallas fijas · Especificación

Historia: `backlog/hu35-areas-seguras.md` · Fecha: 2026-11-22 · Estado: aprobada

## Objetivo

Que nada quede bajo la barra de estado, la muesca o la barra de gestos.

## Requisitos

- R1: tarjeta de llamada con `--safe-top` y márgenes laterales seguros.
- R2: editor de email con área segura arriba, a los lados y abajo.
- R3: probador de agentes con área segura arriba y abajo.
- R4: `.main-content` del shell suma `--safe-left` y `--safe-right` en el móvil.
- R5: revisión de los demás elementos fijos.

## Criterios de aceptación

- C1: en un Android con muesca, la tarjeta de llamada, el editor de email y el probador se ven enteros. **[usuario]**
- C2: en horizontal, el contenido del shell no queda bajo la muesca.
