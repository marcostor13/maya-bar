# HU55 — Implementación de pago único descontable

## Historia

**Como** cliente que no quiere configurar todo solo,
**quiero** contratar la puesta en marcha al suscribirme,
**para** que el equipo de Maya me deje la cuenta lista.

## Contexto (estado actual)

- La landing lista estos paquetes (`SETUP_PACKAGES`):
  - Autoservicio: S/ 0.
  - Puesta en marcha: S/ 490, hoy "gratis con plan anual".
  - Implementación Pro: S/ 1.490.
- El benchmark recomienda cobrar la puesta en marcha siempre y **descontarla** del primer año si el cliente elige el anual.

## Propuesta

1. En el checkout (HU46), selector de implementación. Se cobra en el mismo pago:
   - En trimestral o anual, en la misma preferencia.
   - En mensual, como pago único aparte, justo después de crear el `preapproval`.
2. Con el plan anual, la puesta en marcha se descuenta del total, hasta el 10 % del año.
3. Al pagarla:
   - Se crea una **tarea de onboarding** visible para el superadmin, con los datos de contacto, el paquete y la checklist del paquete.
   - El cliente recibe un correo con un enlace para agendar la primera sesión.
4. Comprobante con una línea aparte para el servicio de implementación (HU49).

## Criterios de aceptación (borrador)

- C1: Crece anual con la puesta en marcha muestra la línea de S/ 490 y el descuento correspondiente, y el total coincide con la preferencia de Mercado Pago.
- C2: tras el pago aparece la tarea de onboarding en el panel del superadmin.
