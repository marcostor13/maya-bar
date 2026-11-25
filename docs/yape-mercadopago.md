# Cobrar con Yape a través de Mercado Pago

Revisado el 2026-11-24 con la documentación oficial de Mercado Pago Perú y la
cuenta de producción de Maya.

## Lo que ya está

- Tu cuenta de Mercado Pago (Perú) tiene **Yape activo** como medio de pago
  (`yape`, tipo `debit_card`, comprobado con la API `/v1/payment_methods`).
- Maya cobra los planes **trimestrales y anuales**, los extras, las recargas y
  la implementación con **Checkout Pro** sin excluir ningún medio de pago. En
  Perú Checkout Pro ofrece tarjeta, dinero en cuenta de Mercado Pago y **Yape**
  ([Checkout Pro](https://www.mercadopago.com.pe/developers/en/docs/checkout-pro/landing)).
  Es decir: **Yape ya debería aparecer** en la pantalla de pago de esos cobros.
- El plan **mensual** es una suscripción (cobro automático cada mes). Yape pide
  confirmar cada pago con un código de la app, así que no sirve para cobros
  recurrentes automáticos: el mensual queda con tarjeta.

## Comprobado en producción (24-11-2026)

Una preferencia de prueba de S/ 10 en la cuenta de producción muestra en
Mercado Pago: Tarjeta, Banca y agentes, PagoEfectivo y **Yape**. Si no lo ves:

- **Elegiste mensual.** La suscripción mensual es un preapproval y Mercado
  Pago solo la cobra con tarjeta. Yape sale en trimestral, anual, extras y la
  implementación.
- **El monto supera tu límite de Yape** (S/ 500, 900 o 2 000 según la
  configuración de la app). Por ejemplo, Crece anual (S/ 2 938,20) no se puede
  pagar con Yape.

## Pasos para que funcione (y comprobarlo)

1. **Confirma Yape en tu cuenta.** En tu panel de Mercado Pago →
   Configuración → Medios de pago, verifica que Yape esté activado para tus
   cobros online. (La API ya lo muestra activo; si en la pantalla de pago no
   aparece, revisa aquí.)
2. **Prueba real.** En <https://mayacrm.site/checkout> elige un plan
   **Trimestral** (o una recarga pequeña desde Mi plan), pulsa Pagar y, en la
   pantalla de Mercado Pago, elige **Yape**: te pide el celular y el código de
   aprobación de 6 dígitos de la app Yape.
3. **Límite de Yape.** El cliente solo puede pagar hasta el tope que tenga
   configurado en su app Yape (S/ 500, S/ 900 o S/ 2,000). Un plan anual que
   pase de ese monto no se puede pagar con Yape: el cliente tendrá que usar
   tarjeta. Conviene decirlo en el checkout.
4. **Notificaciones.** No hay que configurar nada aparte: el pago con Yape
   llega por el mismo webhook (`payment`) y Maya lo trata como cualquier otro
   pago aprobado (activa el plan y manda el aviso de venta, HU75).

## Opcional: Yape dentro del checkout de Maya (sin salir a Mercado Pago)

Mercado Pago permite cobrar con Yape directamente desde tu página con
**Checkout API**
([Yape en Checkout API](https://www.mercadopago.com.pe/developers/es/docs/checkout-api-payments/integration-configuration/yape)):

1. En tu checkout pides el **celular** y el **código OTP** de la app Yape.
2. Con `MercadoPago.js` (`mp.yape.create`) o por API se genera un **token de
   un solo uso**.
3. El backend crea el pago en `POST /v1/payments` con
   `payment_method_id: "yape"`, 1 cuota y un `X-Idempotency-Key`.
4. Para probar hay celulares y OTP de prueba en la documentación.

Esto es un desarrollo nuevo (una historia aparte). No hace falta para empezar:
con Checkout Pro el cliente ya puede pagar con Yape.

## Fuentes

- [Yape — Checkout API (Mercado Pago Developers Perú)](https://www.mercadopago.com.pe/developers/es/docs/checkout-api-payments/integration-configuration/yape)
- [Integra Yape en Checkout API (noticia oficial, 2024)](https://www.mercadopago.com.pe/developers/es/news/2024/07/19/Integrate-Yape-into-Checkout-API-with-the-support-of-the-new-documentation)
- [Checkout Pro — visión general](https://www.mercadopago.com.pe/developers/en/docs/checkout-pro/landing)
- [Medios de pago disponibles](https://www.mercadopago.com.pe/developers/es/docs/sales-processing/payment-methods)
- [Suscripciones](https://www.mercadopago.com.pe/developers/es/docs/subscriptions/overview)
