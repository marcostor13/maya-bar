# HU38 — Gestos en la bandeja y gráficos táctiles · Especificación

Historia: `backlog/hu38-gestos-bandeja-graficos.md` · Fecha: 2026-11-22 · Estado: aprobada

## Objetivo

Responder y copiar mensajes con el dedo, leer bien los canales y ver valores en los gráficos tocando.

## Requisitos

- R1: pulsación larga (450 ms, se cancela al moverse > 10 px; no con ratón) sobre una burbuja → hoja con Responder y Copiar (≥ 48 px).
- R2: pestañas de canal ≥ 40 px con scroll horizontal y puntos suspensivos.
- R3: gráficos — un toque fija el tooltip; tocar fuera lo cierra (línea/columnas y mapa de calor).
- R4: botones de periodo del dashboard ≥ 40 px.

## Criterios de aceptación

- C1: Pulsación larga abre Responder/Copiar; desplazar no la dispara.
- C2: Pestañas de canal no se desbordan y miden ≥ 40 px.
- C3: Tocar un punto del gráfico muestra su valor.
