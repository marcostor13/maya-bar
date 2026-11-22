# HU39 — Inputs sin zoom, puntos de corte y Configuración navegable · Especificación

Historia: `backlog/hu39-inputs-y-puntos-de-corte.md` · Fecha: 2026-11-22 · Estado: aprobada

## Objetivo

Que iOS no haga zoom al escribir, que el padding cuadre con el shell y que Configuración sea navegable en el móvil.

## Requisitos

- R1: regla global en ≤ 768 px: todo input de texto, select y textarea a 16 px con `!important` (gana a los locales).
- R2: entre 769 y 968 px `.main-content .page` usa padding de 24 px; puntos de corte 968/768/480 documentados.
- R3: Configuración con índice de secciones (chips con salto), fijo al desplazar en el móvil; sin `max-width`.

## Criterios de aceptación

- C1: Ningún input < 16 px a 375 px.
- C2: Entre 769 y 968 px, padding de móvil.
- C3: Llegar a cualquier sección en un toque.
