# HU76 — Checkout con mejor diseño, pago seguro y móvil · Especificación

Historia: `hu.md` · Fecha: 2026-11-24 · Estado: aprobada (pedido del usuario)

## Objetivo

El checkout actual es una sopa de botones sin etiquetas, sin señales de
confianza más allá de un texto pequeño y, en el celular, el botón de pagar
queda al fondo. Se rediseña para que se entienda de un vistazo, se vea seguro
(logos de Mercado Pago y de los medios de pago) y se pueda pagar cómodo desde
el celular.

## Usuarios

- Visitante que compra desde la landing.
- Administrador de una empresa que compra o cambia de plan desde su cuenta.

## Alcance

- Incluye: `/checkout` (selección, resumen, datos, pago) y `/checkout/resultado`;
  componente compartido `app-payment-logos`.
- **Fuera de alcance:** cambiar precios, la lógica de cotización, cupones,
  la creación del pago o Checkout API con Yape dentro de la página.

## Requisitos (EARS)

Funcionales:
- **R1** — El checkout debe agrupar las opciones con su etiqueta visible
  (Plan, Forma de pago, Moneda, Implementación); el plan y la implementación
  se eligen con tarjetas con una línea de descripción.
- **R2** — El checkout debe mostrar un sello "Pago seguro procesado por Mercado
  Pago" con el logo de Mercado Pago y los logos de los medios aceptados: en
  suscripción mensual solo tarjetas (Visa, Mastercard, American Express,
  Diners); en pago único además Yape y PagoEfectivo.
- **R3** — El resumen debe mostrar el total destacado, la forma de cobro y
  garantías verificables (los datos de tarjeta se escriben en Mercado Pago;
  boleta o factura; sin permanencia).
- **R4** — En pantallas de hasta 640 px el checkout debe mostrar una sola
  columna (plan → resumen → datos) y una barra fija abajo con el total y el
  botón de pagar, que envía el mismo formulario.
- **R5** — El campo del cupón debe abrirse a pedido; si el cupón viene en la
  URL, debe aparecer abierto y aplicado.
- **R6** — Mientras se calcula el precio, el resumen debe mostrar un
  esqueleto de carga; mientras se conecta con Mercado Pago, el botón muestra
  un indicador y queda deshabilitado.
- **R7** — La pantalla de resultado debe mostrar el logo de Maya, un resumen
  de la compra (qué y total) y la línea de Mercado Pago.

No funcionales:
- **R8** — Solo variables de `styles.scss` para colores de la interfaz (los
  colores de marca de terceros van en los datos del logo); íconos lucide;
  grupos de opciones con `role="radiogroup"`/`radio` y `aria-checked`.
- **R9** — Se conservan los `data-testid` y el comportamiento probado de HU46,
  HU53, HU54 y HU55.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R2 | Dado un plan mensual, cuando carga la cotización, entonces se ve "Pago seguro procesado por", el logo de Mercado Pago y Visa, y no Yape; en anual aparece Yape | unitaria `checkout.spec.ts` (HU76) |
| C2 | R4 | El botón principal y la barra móvil muestran el mismo total | unitaria (HU76) |
| C3 | R5 | El cupón está cerrado por defecto y se abre al pulsar "¿Tienes un cupón?" | unitaria (HU76) |
| C4 | R1, R8 | La opción de plan elegida tiene `role="radio"` y `aria-checked="true"` | unitaria (HU76) |
| C5 | R9 | Las pruebas existentes del checkout siguen pasando | `npx ng test frontend` |
| C6 | R4 | En 390 px de ancho no hay scroll horizontal y la barra de pago queda fija | manual en producción |
| C7 | R7 | El resultado muestra el resumen de la compra | revisión del código |

## Supuestos y decisiones por defecto

- Logos: trazos de Simple Icons (CC0) copiados en
  `shared/payment-logos.data.ts`; Yape no está en Simple Icons y se muestra
  como etiqueta de texto con su color.
- Los pasos "1 Tu plan · 2 Tus datos · 3 Pago en Mercado Pago" son
  orientativos (no es un asistente por pasos).

## Preguntas abiertas

- Ninguna.
