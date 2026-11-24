# HU46 — Checkout desde la landing y desde la cuenta · Spec

## Objetivo

Elegir plan, dejar datos de facturación y pagar en Mercado Pago sin hablar con nadie.

## Requisitos

- R1: ruta pública `/checkout?plan=&periodo=&moneda=`: resumen (plan, periodo, moneda, subtotal, IGV 18 % solo en soles, total) y datos (empresa, nombre, correo, teléfono; boleta DNI o factura RUC con dígito verificador, razón social y dirección; aceptación de términos).
- R2: `GET /public/checkout/quote`, `POST /public/checkout` (Turnstile + throttling 10/h) crea `checkout_sessions` (`pending`, id público aleatorio) y devuelve la URL de Mercado Pago: mensual → `preapproval`; trimestral/anual → preferencia de Checkout Pro con `external_reference = sessionId`, `back_urls` a `/checkout/resultado`.
- R3: `/checkout/resultado?session=` consulta `GET /public/checkout/:id` cada 3 s: "Confirmando…", aprobado, pendiente (PagoEfectivo con instrucciones y aviso de correo), rechazado con "Intentar de nuevo". La URL de vuelta nunca cambia estados; solo `BillingHooks` (webhook/conciliación, HU45).
- R4: desde la cuenta (`TENANT_ADMIN`): `POST /billing/checkout` con la empresa actual; el formulario precarga nombre, correo y datos de facturación; "Elegir y pagar plan" en Mi plan; la landing ofrece "o paga ahora".
- R5: Empresa no se compra en línea (400).

## Fuera de alcance

- Cupones (HU54) e implementación (HU55); alta de la cuenta tras el pago (HU47).

## Criterios de aceptación

| # | Requisito | Criterio | Prueba |
|---|---|---|---|
| C1 | R1, R2 | El total mostrado = el de la preferencia o `preapproval` creada, con IGV desglosado | `checkout.e2e-spec.ts`, `checkout.spec.ts` (back y front) |
| C2 | R1 | RUC con dígito verificador inválido no deja continuar | ídem |
| C3 | R3 | Volver con `status=approved` sin webhook no activa nada | ídem |
| C4 | R3 | PagoEfectivo pendiente: dice cómo pagar y que el acceso llega por correo | ídem |
