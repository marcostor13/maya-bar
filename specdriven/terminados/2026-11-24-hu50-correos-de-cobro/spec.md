# HU50 — Correos de cobro · Spec

## Objetivo

El cliente recibe un correo claro en cada momento del cobro, nunca repetido.

## Requisitos

- R1: plantillas en español con la marca (`billing/emails/billing-email.templates.ts`), puras y con los datos escapados:
  - Bienvenida con pago y acceso.
  - Reenvío de acceso.
  - Pago confirmado.
  - Comprobante.
  - PagoEfectivo pendiente (CIP e instrucciones).
  - Rechazado (motivo legible y reintento con el mismo plan).
  - Prueba (quedan 4, 1 y 0 días).
  - Renovación a −7 días.
  - Cobro mensual fallido.
  - Créditos de IA al 80 % y al 100 %.
  - Cambio de plan o cancelación (la plantilla; HU52 la dispara).
- R2: `BillingMailer`:
  - Bitácora `billing_emails` con `key` única. Se anota antes de enviar; si el envío falla, se borra el registro para reintentar.
  - El mismo aviso nunca sale dos veces.
  - Se copia al correo de facturación si no es el del administrador.
  - El superadmin consulta la bitácora en `GET /billing/admin/emails` (sin el HTML) y reenvía con `POST /billing/admin/emails/:id/resend`.
- R3: disparadores:
  - **Alta nueva** (HU47) → bienvenida. Si ya salió, no se rota el token.
  - **Cuenta existente** (HU47) o **cobro mensual** (HU48) → pago confirmado.
  - **Comprobante emitido** (HU49) → correo del comprobante.
  - **Renovación** (HU48) → aviso de renovación.
  - **Pago pendiente** con `ticket` → PagoEfectivo.
  - **Pago rechazado** → rechazado; si es un cobro de suscripción activa, "actualiza tu tarjeta".
  - **Cron horario** de prueba.
  - **`AiCreditsService.onUsage`** → créditos.
- R4: un correo que falla nunca frena el cobro (`trySend`). En el alta, un fallo de la bienvenida reintenta el paso (HU47).

## Criterios de aceptación

| # | Criterio | Prueba |
|---|---|---|
| C1 | Un pago aprobado de un cliente nuevo da exactamente 2 correos: bienvenida y comprobante | `billing-emails.e2e-spec.ts` |
| C2 | Repetir el webhook no repite los correos | ídem |
| C3 | Cada plantilla tiene una prueba de monto, plan y enlace | `billing-email.templates.spec.ts` |
