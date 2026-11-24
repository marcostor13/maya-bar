# HU50 — Correos de cobro: confirmación, recibo y avisos

## Historia

**Como** cliente de Maya,
**quiero** recibir un correo claro en cada momento del cobro,
**para** saber que pagué, qué pagué y qué tengo que hacer.

## Contexto (estado actual)

- `MailService` (Resend) ya envía correos con HTML (`sendHtml`) y códigos. No hay correos de cobro.

## Propuesta

Plantillas en español, con la marca de Maya, enviadas desde la cola del worker:

| Momento | Correo |
|---|---|
| Pago aprobado, cliente nuevo | **Bienvenida y confirmación de pago**: plan, periodo, monto, botón "Crear mi contraseña y entrar" (HU47) |
| Pago aprobado, cliente existente | **Pago confirmado**: plan, periodo, próxima fecha, botón "Ir a mi cuenta" |
| Comprobante emitido | **Tu boleta/factura**: número, PDF y XML (HU49) |
| Pago pendiente (PagoEfectivo) | Código CIP e instrucciones; aviso cuando se acredita |
| Pago rechazado | Motivo legible y "Intentar con otro medio" |
| Prueba: días 10, 13 y 14 | Días restantes y "Elegir plan" |
| Renovación trimestral o anual: −7 días | Monto y enlace de pago |
| Cobro mensual fallido | "Actualiza tu tarjeta" (HU51) |
| Créditos IA al 80 % y 100 % | Saldo y "Recargar" |
| Cambio de plan o cancelación | Qué cambia y desde cuándo |

1. Cada envío queda en `billing_emails` (tipo, pago y fecha) para no repetirlo y poder reenviarlo desde superadmin.
2. Copia al correo de facturación si es distinto del correo del administrador.

## Criterios de aceptación (borrador)

- C1: un pago aprobado de un cliente nuevo genera exactamente 2 correos: bienvenida y comprobante (cuando este se emite).
- C2: repetir el webhook no repite los correos.
- C3: cada plantilla tiene una prueba que comprueba el monto, el plan y el enlace correcto.
