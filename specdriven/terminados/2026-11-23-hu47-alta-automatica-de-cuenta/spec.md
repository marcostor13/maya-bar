# HU47 — Alta y acceso automático tras el pago · Spec

## Objetivo

Quien paga recibe enseguida su cuenta activa con el plan, sin que nadie la cree a mano.

## Requisitos

- R1: cuando una `checkout_session` pasa a `paid` (webhook o conciliación, HU45/HU46), se hace el alta. Es idempotente: queda en `fulfilled` y un segundo aviso no hace nada.
- R2: **cliente nuevo:**
  - Se crea la empresa (nombre libre, sin chocar con otra) con plan y periodo, `subscription.status = active` y `currentPeriodEnd` según el periodo.
  - Se guardan los datos de facturación del checkout.
  - Se crea un TENANT_ADMIN con `emailVerified: true`.
  - Se manda un correo con un enlace de acceso de un solo uso (token guardado como hash SHA-256, válido 72 h).
- R3: **cuenta existente:** si compra desde la cuenta (`tenantId` en la sesión), o si el correo es de un TENANT_ADMIN confirmado, el plan se activa en esa empresa. Si queda periodo vigente, el nuevo se suma al final.
- R4: **correo de otro rol** (por ejemplo superadmin): se crea una empresa nueva sin usuario y se avisa a los superadmin por correo. Un registro sin confirmar con ese correo se descarta.
- R5: rutas nuevas:
  - `POST /auth/access {email, token, password}`: fija la contraseña, invalida el enlace y abre sesión.
  - `POST /auth/access/resend`: respuesta genérica; solo manda un enlace si la cuenta aún no tiene contraseña.
  - Pantalla `/acceso` con "Reenviar acceso" si el enlace venció; tras crear la contraseña lleva a `/onboarding`.
- R6: `/checkout/resultado`: con `paid` muestra "Activando tu cuenta…" y con `fulfilled` "Listo".

## Fuera de alcance

- Comprobante SUNAT (HU49) y correo de bienvenida/confirmación con detalle (HU50). El correo de acceso ya incluye el plan.

## Criterios de aceptación

| # | Criterio | Prueba |
|---|---|---|
| C1 | Pago aprobado de un correo nuevo → 1 empresa activa, 1 admin y 1 correo con el enlace | `account-provisioning.e2e-spec.ts` |
| C2 | Repetir el webhook (también en paralelo) no crea una segunda empresa | ídem |
| C3 | El enlace sirve una sola vez y vence a las 72 h; vencido, ofrece "Reenviar acceso" | ídem + `access.spec.ts` |
| C4 | Una cuenta en prueba que paga conserva sus datos y pasa a `active` | ídem |
