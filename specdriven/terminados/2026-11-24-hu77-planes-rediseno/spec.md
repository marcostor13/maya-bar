# HU77 — Sección de planes más clara y confiable · Especificación

Historia: `hu.md` · Fecha: 2026-11-24 · Estado: aprobada (pedido del usuario)

## Objetivo

La sección de precios ya muestra los planes, pero el ahorro del pago
trimestral o anual solo aparece en letra pequeña, no hay ninguna señal de pago
seguro y en el celular el selector de periodo con sus etiquetas de ahorro se
desborda y el plan recomendado queda segundo.

## Usuarios

- Visitante de la landing que compara planes.

## Alcance

- Incluye: sección `#precios` de `landing.ts`.
- **Fuera de alcance:** precios y límites (vienen del catálogo, HU56), la
  sección de implementación, la página "Mi plan".

## Requisitos (EARS)

Funcionales:
- **R1** — Cuando el periodo es trimestral o anual, cada plan con precio debe
  mostrar tachado el precio mensual de lista junto al equivalente mensual.
- **R2** — Bajo los planes debe verse un bloque de confianza: "14 días gratis,
  sin tarjeta", "Sin permanencia", "Boleta o factura electrónica" y el sello
  de Mercado Pago con los medios aceptados (incluido Yape).
- **R3** — En pantallas de hasta 640 px el selector de periodo debe ocupar el
  ancho disponible sin desbordarse (etiqueta de ahorro debajo del texto) y el
  plan destacado debe aparecer primero.

No funcionales:
- **R4** — Solo variables de `styles.scss`; el prerender (SSR) no cambia de
  comportamiento; se mantienen `data-buy` y las pruebas de HU56.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | En mensual no hay precio tachado; en anual Crece muestra tachado su precio mensual | unitaria `landing.spec.ts` (HU77) |
| C2 | R2 | El bloque de confianza tiene el logo de Mercado Pago y Yape | unitaria (HU77) |
| C3 | R4 | Las pruebas de precios de HU56 siguen pasando | `npx ng test frontend` |
| C4 | R3 | En 390 px el selector no desborda y Crece aparece primero | manual en producción |

## Supuestos y decisiones por defecto

- Se reutiliza `app-payment-logos` de HU76.

## Preguntas abiertas

- Ninguna.
