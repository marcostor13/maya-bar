# HU18 — Costos de los mensajes en el dashboard · Especificación

Historia: `hu.md` · Fecha: 2026-11-18 · Estado: aprobada

## Objetivo

Que el administrador vea cuánto le cuesta (estimado, USD) lo que envía por cada
canal en el periodo del dashboard.

## Usuarios

- TENANT_ADMIN. Los demás roles no ven costos.

## Alcance

- Incluye: guardar `pricing` de Meta en los mensajes de WhatsApp, tabla de
  tarifas (1-oct-2026), tarjeta de costos con desglose, tarifas configurables
  de SMS (por segmento) y correo (por 1.000), aviso de estimación con fuentes.
- **Fuera de alcance:** escalones de volumen de Meta, facturación real,
  moneda distinta de USD, SMS y correos de la derivación (HU de agentes).

## Requisitos (EARS)

- **R1** — Cuando llega un estado de WhatsApp con `pricing`, el sistema debe
  guardar en el mensaje la categoría, el tipo y, si `type` es `regular`, el
  costo según el mercado del destinatario. Un segundo `pricing` no lo duplica.
- **R2** — Cuando el administrador pide los costos de un periodo, el sistema
  debe devolver: WhatsApp (total y por categoría, mensajes cobrados y
  gratuitos), SMS (segmentos enviados por campañas y API × tarifa), correo
  (enviados por campañas y bandeja × tarifa / 1.000), Instagram y Messenger
  (cantidad, 0 USD) y el total.
- **R3** — Si la tarifa de SMS o de correo no está configurada, el sistema debe
  mostrar la cantidad y el costo como «sin tarifa», sin sumarlo.
- **R4** — Cuando el administrador guarda las tarifas (0 a 10 USD por segmento,
  0 a 1.000 USD por 1.000 correos), el sistema debe usarlas desde ese momento.
- **R5** — Solo TENANT_ADMIN (403) y siempre dentro de su empresa.
- **R6** — La tarjeta indica que son estimaciones con tarifas de lista y enlaza
  a las fuentes.

## Criterios de aceptación

| # | Req. | Dado / Cuando / Entonces | Cómo se verifica |
|---|---|---|---|
| C1 | R1 | Mercado por prefijo (51→Perú, 1809→Resto de Latam, 7→Rusia, desconocido→Otros) y precio por categoría | unitaria |
| C2 | R1 | Un ack con `pricing` regular marketing a +51 guarda 0.0703; uno `free_customer_service` guarda 0 | e2e API |
| C3 | R2 | Costos del periodo con WhatsApp, SMS de API y campañas, correos; otra empresa no suma | e2e API |
| C4 | R3, R4 | Sin tarifas: SMS/correo con `usd: null`; tras guardarlas, costo calculado; tarifa fuera de rango → 400 | e2e API |
| C5 | R5 | MARKETING → 403 en costos y tarifas | e2e API |
| C6 | R2, R6 | La tarjeta pinta total, desglose, «sin tarifa», aviso y enlaces; guardar tarifas manda toast | unitaria frontend |

## Supuestos y decisiones por defecto

- Tarifas de lista de `docs/costos-mensajes.md`; +7 se trata como Rusia.
- SMS de campañas: segmentos estimados con el texto base de la campaña.
- Los correos de la bandeja se cuentan por mensajes salientes de
  conversaciones de correo.

## Preguntas abiertas

- Ninguna.
