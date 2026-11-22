# HU36 — Seguimiento cómodo con el dedo · Especificación

Historia: `backlog/hu36-seguimiento-tactil.md` · Fecha: 2026-11-22 · Estado: aprobada

## Objetivo

Trabajar el embudo de oportunidades desde el móvil sin depender del arrastre.

## Requisitos

- R1: por debajo de 768 px la vista inicial es la lista; la elección se recuerda (`maya.leads.view`).
- R2: botón "Mover" en cada tarjeta que se puede trabajar → hoja inferior con las etapas (la actual, desactivada).
- R3: tablero con `scroll-snap` (una columna por pantalla) en el móvil.
- R4: chips de etapa, "Tomar", "Mover" y botones de vista de ≥ 40 px; buscador a 16 px.

## Criterios de aceptación

- C1: En 360 px abre en lista.
- C2: Cambiar la etapa sin arrastrar y que se guarde.
- C3: Toques ≥ 40 px y buscador sin zoom.
