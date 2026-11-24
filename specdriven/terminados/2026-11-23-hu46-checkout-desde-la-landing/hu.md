# HU46 — Checkout desde la landing y desde la cuenta

## Historia

**Como** visitante de la landing o cliente en prueba,
**quiero** elegir un plan, dejar mis datos de facturación y pagar con tarjeta o Yape,
**para** suscribirme sin hablar con nadie.

## Contexto (estado actual)

- Los botones de los planes de la landing llevan al registro, no a un pago.
- Mercado Pago Perú acepta tarjeta de crédito y débito, Yape y PagoEfectivo en Checkout Pro. Las suscripciones automáticas (`preapproval`) solo aceptan tarjeta.

## Propuesta

1. Ruta pública `/checkout?plan=crece&periodo=mensual`:
   - **Resumen**: plan, periodo, moneda, subtotal, IGV 18 %, total, y los campos de cupón (HU54) e implementación (HU55).
   - **Datos**:
     - Empresa, nombre, correo y teléfono.
     - Comprobante: boleta con DNI o factura con RUC, razón social y dirección.
     - Validación del dígito verificador del RUC y aceptación de los términos.
2. Al confirmar se crea una `checkout_session` (estado `pending`) y se redirige:
   - **Mensual** → `preapproval` de Mercado Pago (cobro automático con tarjeta).
   - **Trimestral o anual** → preferencia de Checkout Pro (tarjeta, Yape o PagoEfectivo) con `external_reference = sessionId`.
3. Vuelta (`back_urls`) a `/checkout/resultado?session=…`:
   - Consulta el estado y muestra "Confirmando tu pago…" hasta que el webhook lo confirma: aprobado, pendiente (PagoEfectivo) o rechazado con "Intentar de nuevo".
   - Nunca activa la cuenta por la URL de vuelta; solo por el webhook o la conciliación (HU45).
4. Desde la cuenta en prueba (banner o "Mi plan"), el mismo checkout con los datos ya llenos y sin crear otra empresa.
5. Protección: Turnstile en el checkout público y throttling, como en `/auth/register`.

## Criterios de aceptación (borrador)

- C1: el total mostrado es igual al de la preferencia o `preapproval` creada (prueba con Mercado Pago simulado), con el IGV desglosado.
- C2: un RUC con dígito verificador inválido no deja continuar.
- C3: volver con `status=approved` en la URL sin webhook no activa nada.
- C4: con PagoEfectivo pendiente, la pantalla dice cómo pagar y que el acceso llega por correo.
