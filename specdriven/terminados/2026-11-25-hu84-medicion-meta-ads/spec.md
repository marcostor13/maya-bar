# HU84 · Especificación
Historia: `hu.md` · Fecha: 2026-11-25 · Estado: aprobada (el usuario pidió "toda completa").

## Alcance
Solo el embudo web de Maya CRM (su propia publicidad). Los leads que entran por anuncios de clic a WhatsApp al 991 172 822 ya se reportan con el relevo a Ignia (`docs/conversiones-atribucion.md`); no se duplica aquí.

## Requisitos
- **R1 Consentimiento (Ley 29733).** Las páginas públicas muestran un aviso con "Aceptar" y "Solo necesarias". Sin "Aceptar" no se carga el píxel ni se envían datos personales a Meta por CAPI. La elección se recuerda y se puede cambiar desde el pie de la política de privacidad ("Preferencias de cookies").
- **R2 Píxel.** Con consentimiento, en el dominio de la plataforma (nunca en dominios de clientes ni dentro de la app privada) se carga el píxel `META_PIXEL_ID` y se envía:
  - `PageView` en cada navegación pública;
  - `ViewContent` una vez por visita cuando la sección `#precios` entra en pantalla;
  - `Contact` al pulsar cualquier enlace a `wa.me`;
  - `CompleteRegistration` al confirmar el correo, con el mismo `event_id` que el servidor.
- **R3 Atribución.** Al entrar a la web se guardan (primer toque, 90 días, `localStorage`) `utm_source/medium/campaign/content/term`, `fbclid` y la página de entrada. Se envían con el registro junto con `fbc`, `fbp` y la decisión de consentimiento, y se guardan en la empresa (`tenant.acquisition`) con IP y navegador.
- **R4 CAPI.** El backend envía a `graph.facebook.com/{pixel}/events`:
  - `CompleteRegistration` al confirmar el correo (o al registrarse si no hay verificación), `event_id = reg_<tenantId>`;
  - `Purchase` por cada pago aprobado de una empresa, con valor y moneda reales, `event_id = pay_<paymentId>`.
  - `user_data`: correo, teléfono (solo dígitos, con 51 si son 9 dígitos) y `external_id` (id de empresa) con SHA-256; `fbc`, `fbp`, IP y navegador sin hash. Solo si la empresa dio consentimiento.
  - Cada evento se guarda en `meta_capi_events` con índice único por `eventId`: nunca se envía dos veces; se reintenta con espera creciente hasta 6 veces.
  - Sin `META_PIXEL_ID` o `META_CAPI_TOKEN` no se envía nada (desarrollo y pruebas). `META_TEST_EVENT_CODE` opcional.
- **R5 Dominio.** `index.html` lleva la meta etiqueta `facebook-domain-verification` del portafolio.
- **R6 Privacidad.** La política explica el píxel y la CAPI, qué se envía, la base (consentimiento) y cómo retirarlo; mantiene que los datos de los contactos de los clientes nunca se usan para publicidad.

## Criterios
| # | Criterio | Verificación |
|---|---|---|
| C1 | Sin consentimiento no hay `fbevents.js` ni `fbq`; con "Aceptar" se carga y sale `PageView` | prueba unitaria del servicio |
| C2 | `Contact` al pulsar `wa.me`, `ViewContent` una vez, nada en dominios de clientes ni rutas privadas | prueba unitaria |
| C3 | UTM y `fbclid` se guardan con primer toque y viajan en el registro | pruebas de frontend y backend |
| C4 | CAPI arma `user_data` con hash correcto, respeta el consentimiento y no duplica | `meta-capi.service.spec.ts` |
| C5 | `Purchase` por pago aprobado, una sola vez | `meta-capi.service.spec.ts` |
| C6 | Meta etiqueta de dominio y política actualizadas | revisión + build |
| C7 | Eventos visibles en "Probar eventos" del Administrador de eventos | [usuario] tras configurar variables |
