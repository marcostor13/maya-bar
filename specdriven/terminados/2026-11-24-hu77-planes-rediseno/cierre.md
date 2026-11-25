# HU77 — Sección de planes más clara y confiable · Cierre

- **Cerrada:** 2026-11-24
- **Estado:** Terminada (revisión visual en producción tras el deploy)
- **Verificación (spec-verifier):** 2 CUMPLE · 1 PARCIAL · 1 NO VERIFICADO; M1, B1 y B2 corregidos
- **Commits:** ver `git log` (commit de HU74–HU77)

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Precio de lista tachado en trimestral/anual | CUMPLE | `landing.ts` `listMonthly`; `landing.spec.ts` (HU77) |
| C2 | Bloque de confianza con Mercado Pago y Yape | CUMPLE (tras corrección: en mensual solo tarjetas) | `landing.ts` `.pay-trust`; spec |
| C3 | Pruebas de HU56 siguen pasando | CUMPLE | 1034/1034 |
| C4 | 390 px: selector sin desbordar, Crece primero | NO VERIFICADO → revisión en producción | CSS `@media (max-width: 640px)` |

## Qué se implementó

- Precio mensual tachado (con símbolo y texto para lectores de pantalla) en trimestral y anual.
- Bloque de confianza: 14 días gratis, sin permanencia, boleta o factura y sello de Mercado Pago (Yape solo fuera del mensual).
- Móvil: selector a todo el ancho con el ahorro debajo; plan destacado primero.

## Lo que tiene que hacer el usuario

- Nada.

## Pruebas

- `npx ng test frontend` → 1034/1034; prerender OK.

## Pendientes, riesgos y notas

- Sin pruebas de soles ni del plan a medida con precio tachado.
