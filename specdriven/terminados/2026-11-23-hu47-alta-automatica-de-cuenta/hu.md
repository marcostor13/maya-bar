# HU47 — Alta y acceso automático a la cuenta tras el pago

## Historia

**Como** cliente que acaba de pagar,
**quiero** recibir de inmediato el acceso a mi cuenta de Maya ya activa con mi plan,
**para** empezar a trabajar sin esperar a que alguien me la cree.

## Contexto (estado actual)

- `AuthService.registerTenant` crea la empresa y el usuario principal y pide verificar el correo con un código. Hay `discardPendingRegistration` para registros sin confirmar.
- `MailService` envía con Resend (`sendEmailVerificationEmail`, `sendPasswordResetEmail`, `sendHtml`).

## Propuesta

Cuando el webhook (HU45) confirma un pago aprobado de una `checkout_session`:

1. **Cliente nuevo** (el correo no existe):
   - Crea la empresa con el plan y periodo pagados, `subscription.status = 'active'` y `currentPeriodEnd` de su periodo.
   - Crea el usuario administrador con `emailVerified: true`, porque pagar con ese correo lo verifica.
   - Genera un **enlace de acceso de un solo uso** (token con hash, 72 h) para crear la contraseña.
2. **Cliente en prueba o con cuenta** (sesión iniciada en el checkout o mismo correo con empresa propia): activa el plan en su empresa existente, sin crear otra.
3. **Correo con el mismo correo pero de otra empresa o rol**: no mezcla nada. Crea la empresa nueva y avisa al superadmin.
4. Todo en una transacción idempotente: el mismo pago nunca crea dos empresas.
5. Dispara el comprobante (HU49) y el correo de bienvenida y confirmación (HU50).
6. La pantalla `/checkout/resultado` pasa sola a "Listo: revisa tu correo" y, si hay sesión, a "Ir a mi cuenta".
7. Onboarding: el primer acceso abre `/onboarding` con el plan ya cargado.

## Criterios de aceptación (borrador)

- C1: un pago aprobado de un correo nuevo crea 1 empresa activa y 1 administrador, y envía 1 correo con el enlace de acceso (e2e).
- C2: repetir el webhook no crea una segunda empresa.
- C3: el enlace de acceso sirve una sola vez y vence a las 72 h; vencido, ofrece "Reenviar acceso".
- C4: una cuenta en prueba que paga conserva sus datos y pasa a `active`.
