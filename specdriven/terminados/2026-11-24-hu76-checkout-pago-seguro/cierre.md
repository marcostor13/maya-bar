# HU76 — Checkout con mejor diseño, pago seguro y móvil · Cierre

- **Cerrada:** 2026-11-24
- **Estado:** Terminada (revisión visual en producción tras el deploy)
- **Verificación (spec-verifier):** 6 CUMPLE · 1 NO VERIFICADO (C6, manual); hallazgos de accesibilidad corregidos
- **Commits:** ver `git log` (commit de HU74–HU77)

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Sello Mercado Pago y medios según modo | CUMPLE | `shared/payment-logos.ts`, `checkout.spec.ts` (HU76) |
| C2 | Mismo total en botón y barra móvil | CUMPLE | `payAmount()`; spec |
| C3 | Cupón a pedido / abierto desde la URL | CUMPLE | `couponOpen`; 2 pruebas |
| C4 | radiogroup / aria-checked | CUMPLE | `checkout.ts`; spec |
| C5 | Pruebas anteriores siguen pasando | CUMPLE | 1034/1034 |
| C6 | 390 px sin scroll horizontal, barra fija | NO VERIFICADO → revisión en producción | CSS `@media (max-width: 640px)` |
| C7 | Resultado con resumen | CUMPLE | `checkout-result.ts` `recap` |

## Qué se implementó

- Componente `app-payment-logos` (Mercado Pago, Visa, Mastercard, Amex, Diners; Yape y PagoEfectivo en pago único). Trazos de Simple Icons (CC0).
- `/checkout`: opciones con etiqueta, tarjetas de plan e implementación, pasos, resumen fijo con esqueleto, garantías, cupón a pedido, barra de pago fija en móvil.
- `/checkout/resultado`: logo, resumen de la compra y sello.
- Tras la verificación: contraste del texto verde, foco visible, `prefers-reduced-motion`, `aria-live` solo en el total, color de Yape en los datos.

## Lo que tiene que hacer el usuario

- Nada.

## Pruebas

- `npx ng test frontend` → 1034/1034; `npm run build` OK.

## Pendientes, riesgos y notas

- Los grupos de opciones no se recorren con flechas (cada opción es una parada de Tab).
- Radios fijos (8–16 px) en algunos elementos nuevos.
