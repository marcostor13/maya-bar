# Costos de los mensajes por canal

Investigado el 2026-11-18 en la documentación oficial. Lo usa el dashboard
(HU18) para estimar lo que cuesta lo que envía cada empresa. Son **estimaciones
con tarifas de lista**: la factura real la emite cada proveedor.

## WhatsApp Business Platform (Cloud API, Meta)

Fuentes:
- Precios (actualizado 30-sep-2026): https://developers.facebook.com/docs/whatsapp/pricing
- Webhook de estados (actualizado 4-nov-2026): https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/reference/messages/status
- Autenticación internacional: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/authentication-international-rates

Hoja "Cost per message in USD on the WhatsApp Business Platform, effective
October 1, 2026". Meta solo cambia tarifas el día 1 de cada trimestre; próxima
revisión posible: 1-ene-2027.

### Modelo de cobro

- Por mensaje **entregado**, de la empresa al usuario. Precio = categoría ×
  mercado (el mercado sale del prefijo del destinatario).
- Categorías: `marketing`, `utility`, `authentication` (plantillas) y
  `service` (texto libre dentro de la ventana de 24 h).
- Desde el **1-oct-2026** se vuelven a cobrar `service` (tarifa = utility) y
  los `utility` dentro de la ventana.
- Gratis:
  1. Ventana de punto de entrada gratuito (anuncio de clic a WhatsApp), hasta 7 días.
  2. Los primeros **1.000 `service` al mes por número**.
  3. Lo que escribe el usuario.
  4. `service` de gobiernos/ONG elegibles (`subtype: paid_exempt`) hasta 31-dic-2027.
- Escalones de volumen (rebajas de utility/authentication): **no incluidos**.

### Webhook `statuses[].pricing`

Llega en el estado `sent` o en `delivered` (nunca en ambos):

```json
"pricing": { "billable": true, "pricing_model": "PMP", "type": "regular", "category": "marketing" }
```

- `type`: `regular` (se cobra), `free_customer_service`, `free_entry_point`,
  `free_group_customer_service`.
- `category`: `authentication`, `authentication-international`, `marketing`,
  `marketing_lite`, `utility`, `service`, `referral_conversion`, `group_*`.
- `billable` está anunciado como obsoleto: se usa `type` + `category`.

### Tarifas en USD (vigentes desde 1-oct-2026)

| Mercado | marketing | utility / service | authentication | auth. internacional |
|---|---|---|---|---|
| Argentina | 0.0618 | 0.026 | 0.026 | — |
| Brasil | 0.0625 | 0.0068 | 0.0068 | — |
| Chile | 0.0889 | 0.02 | 0.02 | — |
| Colombia | 0.0125 | 0.0008 | 0.0008 | — |
| México | 0.0397 | 0.0085 | 0.0085 | — |
| Perú | 0.0703 | 0.03 | 0.03 | — |
| España | 0.0707 | 0.02 | 0.02 | — |
| Norteamérica (US, CA) | 0.025 | 0.0034 | 0.0034 | — |
| India | 0.0118 | 0.0014 | 0.0014 | 0.0304 |
| Indonesia | 0.0411 | 0.025 | 0.025 | 0.136 |
| Italia | 0.0795 | 0.03 | 0.03 | — |
| Alemania | 0.1365 | 0.055 | 0.055 | — |
| Francia | 0.0859 | 0.03 | 0.03 | — |
| Reino Unido | 0.0635 | 0.022 | 0.022 | — |
| Egipto | 0.0644 | 0.0036 | 0.0036 | 0.065 |
| Malasia | 0.086 | 0.014 | 0.014 | 0.0418 |
| Nigeria | 0.0516 | 0.0067 | 0.0067 | 0.075 |
| Pakistán | 0.0473 | 0.015 | 0.015 | 0.075 |
| Arabia Saudita | 0.0576 | 0.0107 | 0.0107 | 0.0598 |
| Sudáfrica | 0.0379 | 0.0095 | 0.0095 | 0.02 |
| Turquía | 0.0109 | 0.0009 | 0.0009 | — |
| Emiratos | 0.0576 | 0.0157 | 0.0157 | 0.051 |
| Israel | 0.0353 | 0.0053 | 0.0053 | — |
| Países Bajos | 0.1597 | 0.05 | 0.05 | — |
| Rusia | 0.0802 | 0.04 | 0.04 | — |
| Bangladés | 0.0732 | 0.0037 | 0.0037 | 0.096 |
| Hong Kong | 0.0732 | 0.026 | 0.026 | — |
| Hungría | 0.086 | 0.035 | 0.035 | — |
| Irak | 0.0341 | 0.0079 | 0.0079 | 0.128 |
| Kazajistán | 0.0604 | 0.018 | 0.018 | 0.16 |
| Kuwait | 0.0792 | 0.044 | 0.044 | 0.12 |
| Marruecos | 0.0414 | 0.023 | 0.023 | 0.0811 |
| Nepal | 0.0732 | 0.0034 | 0.0034 | 0.112 |
| Omán | 0.0341 | 0.0247 | 0.0247 | 0.06 |
| Polonia | 0.0366 | 0.0122 | 0.0122 | — |
| Catar | 0.0341 | 0.012 | 0.012 | — |
| Rumanía | 0.086 | 0.029 | 0.029 | — |
| Singapur | 0.0732 | 0.016 | 0.016 | — |
| Sri Lanka | 0.0732 | 0.002 | 0.002 | 0.144 |
| Ucrania | 0.086 | 0.0298 | 0.0298 | 0.0746 |
| Resto de África | 0.0225 | 0.004 | 0.004 | — |
| Resto de Asia Pacífico | 0.0842 | 0.0113 | 0.0113 | — |
| Resto de Europa central y del este | 0.086 | 0.0212 | 0.0212 | — |
| Resto de Latinoamérica | 0.074 | 0.0113 | 0.0113 | — |
| Resto de Oriente Medio | 0.0392 | 0.0091 | 0.0091 | — |
| Resto de Europa occidental | 0.0592 | 0.0171 | 0.0171 | — |
| Otros | 0.0604 | 0.0077 | 0.0077 | — |

Regiones agregadas (prefijos):
- Resto de Latinoamérica: 591, 506, 593, 503, 502, 509, 504, 505, 507, 595, 598, 58; +1 809/829/849 (RD), 658/876 (JM), 787/939 (PR).
- Resto de Europa occidental: 43, 32, 45, 358, 353, 47, 351, 46, 41.
- Resto de Europa central y del este: 355, 374, 994, 375, 359, 385, 420, 995, 30, 371, 370, 373, 389, 381, 421, 386.
- Resto de África: 213, 244, 229, 267, 226, 257, 237, 235, 242, 291, 251, 241, 220, 233, 245, 225, 254, 266, 231, 218, 261, 265, 223, 222, 258, 264, 227, 250, 221, 232, 252, 211, 249, 268, 255, 228, 216, 256, 260, 263.
- Resto de Asia Pacífico: 93, 61, 855, 86, 81, 856, 976, 64, 675, 63, 886, 992, 66, 993, 998, 84.
- Resto de Oriente Medio: 973, 962, 961, 967.
- Rusia y Kazajistán comparten +7: se asume Rusia (Meta no publica la regla de sub-prefijos).

## Instagram y Messenger

"The Messenger Platform is free to use." —
https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview
(la mensajería de Instagram va por la misma plataforma). Costo 0.

## SMS

No hay tarifa única: depende del proveedor y del país. Se cobra por
**segmento** (Twilio: https://www.twilio.com/docs/glossary/what-sms-character-limit):

| Codificación | 1 segmento | Por segmento si se divide |
|---|---|---|
| GSM-7 | 160 | 153 |
| UCS-2 (tildes no GSM, emojis) | 70 | 67 |

La empresa indica el **costo por segmento** de su proveedor en el dashboard: tarjeta «Costos de mensajes» → «Tarifas».

## Correo (Resend)

https://resend.com/pricing — Free: 3.000/mes (100/día). Pro 20 USD: 50.000/mes;
exceso 0,90 USD por cada 1.000. Se cobra por plan, no por correo: el dashboard
muestra la cantidad y, si la empresa lo configura (tarjeta «Costos de mensajes» → «Tarifas»), un costo por cada 1.000.
