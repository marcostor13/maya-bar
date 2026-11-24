# HU53 — Add-ons y recargas de créditos

## Historia

**Como** cliente que llegó al límite,
**quiero** comprar un usuario, un número o créditos de IA sin cambiar de plan,
**para** seguir trabajando hoy.

## Contexto (estado actual)

- La landing ya lista los add-ons (`ADDONS` en `landing.data.ts`):
  - Usuario: S/ 39/mes.
  - Número de WhatsApp: S/ 49/mes.
  - 1.000 créditos: S/ 49; 5.000 créditos: S/ 199.
  - 10.000 contactos: S/ 35/mes.
  - 10.000 emails: S/ 29.

## Propuesta

1. **Add-ons mensuales** (usuario, número, contactos): se suman a la suscripción.
   - En mensual, sube el monto del `preapproval` y el primer mes se cobra prorrateado.
   - En trimestral o anual, se cobra un pago único prorrateado hasta el fin del periodo.
2. **Recargas** (créditos de IA, emails): pago único por Checkout Pro (tarjeta o Yape). Duran 12 meses y se gastan después de lo incluido en el plan.
3. Compra desde "Mi plan" (HU44) y desde el aviso de límite (HU42), en un solo paso.
4. Cada compra lleva su comprobante (HU49) y su correo (HU50).

## Criterios de aceptación (borrador)

- C1: comprar 1.000 créditos aprobados sube el saldo en 1.000 y genera un comprobante.
- C2: un usuario extra en Inicia permite crear el 3.er usuario y suma S/ 39 al siguiente cobro mensual.
