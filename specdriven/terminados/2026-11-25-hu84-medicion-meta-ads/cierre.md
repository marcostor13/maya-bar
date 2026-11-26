# HU84 · Cierre
Fecha: 2026-11-25 · Estado: terminada; falta activarla con el usuario.

## Qué se hizo
- **Backend:** módulo `meta-ads/`.
  - `MetaCapiEvent` en la colección `meta_capi_events`, con índice único por `eventId`.
  - `MetaCapiService` envía `CompleteRegistration` (`reg_<tenantId>`) al registrarse o confirmar el correo, y `Purchase` (`pay_<paymentId>`) con un barrido de pagos aprobados cada 5 minutos.
  - `user_data` con SHA-256, enviado solo si hubo consentimiento. Reintenta con espera creciente; sin `META_PIXEL_ID` y `META_CAPI_TOKEN` no hace nada.
  - Los archivos de `billing/` no se tocaron.
- **Registro:** la empresa guarda `tenant.acquisition` (UTM, fbclid, fbc, fbp, página de entrada, consentimiento, IP y navegador). La respuesta devuelve `metaEventId`. `GET /tenants/me` no expone `acquisition`.
- **Frontend:**
  - `MetaTrackingService` guarda el primer toque durante 90 días.
  - El píxel solo carga con consentimiento, en el dominio de la plataforma y en páginas públicas, con `disablePushState`.
  - Eventos: PageView, ViewContent de precios, Contact en `wa.me` y CompleteRegistration con el mismo `eventID` del servidor.
  - Al rechazar o reabrir el aviso, `fbq('consent','revoke')`.
  - Aviso de cookies y botón "Preferencias de cookies" en las páginas legales.
- **Otros:** meta etiqueta de dominio en `index.html` y política de privacidad con la sección de cookies y medición.

## Verificación
- Backend:
  - Suite completa: 1825 pruebas en verde.
  - Después: 95 en `tenants`, `meta-ads` y `auth`, y build sin errores.
- Frontend:
  - Suite completa: 1055 pruebas en verde.
  - `meta-tracking` (7) y `register` en verde.
  - Build con 21 rutas prerenderizadas y lint limpio.
- spec-verifier: 4 CUMPLE, 2 PARCIAL y 1 NO VERIFICADO (C7 depende del usuario). Se corrigió:
  - H1: el píxel mandaba PageView en rutas privadas. Ahora tiene `disablePushState`.
  - H2: retirar el consentimiento no tenía efecto. Ahora se revoca en el navegador y la política explica cómo pedirlo para la CAPI.
  - H3: un evento podía enviarse dos veces. Ahora el primer reintento queda a un minuto.
  - Bajo: `acquisition` se veía en `/tenants/me` y el banner tenía `role="dialog"`. Ahora `/tenants/me` lo oculta y el banner usa `role="region"`.

## Pendiente del usuario
- Poner el id del píxel en `metaPixelId` de `environment.prod.ts`.
- En Coolify: `META_PIXEL_ID` y `META_CAPI_TOKEN`.
- Verificar el dominio después del deploy.
- Probar con "Probar eventos".
