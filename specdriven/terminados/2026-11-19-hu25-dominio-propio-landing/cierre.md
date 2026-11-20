# Cierre — HU25 Dominio propio para la landing de un evento

**Fecha:** 2026-11-19 · **Estado:** Terminada (pendiente prueba real con un dominio, C8)

## Qué se hizo
- Backend: modelo `LandingDomain` (pending → dns_ok → activating → active, `verifyToken`), `LandingDomainsService` y controlador (`/landing-domains`, `/public/landing-domains/resolve?host=`).
- Verificación: DNS (CNAME a `mayacrm.site` o A a `SERVER_IP`) + TXT `_maya-verify.<dominio>` con el token de la empresa + `/healthz` por https. Con todo bien, el backend añade el dominio a la app del **frontend** en Coolify y la redespliega.
- `ProxyDomainsService` multi-app: `ensure/remove(domain, appUuid)`, `frontendAppUuid()` (env `COOLIFY_FRONTEND_APP_UUID` o búsqueda por `FRONTEND_URL`).
- Un host no puede ser dominio de links y de landing a la vez. CORS abierto en `/public/events*` y `/public/landing-domains*`.
- Frontend: `server.ts` entrega `index.csr.html` en hosts ajenos (y redirige cualquier ruta a `/`); ruta raíz con `canMatch` de dominio propio; `PublicEventComponent` resuelve el evento por host; tarjeta «Dominio propio» en Marketing del evento.
- `scripts/provision.js` conserva los dominios añadidos al frontend y pasa `COOLIFY_FRONTEND_APP_UUID`. Documentación en `docs/deploy.md`.

## Verificación
- Mecánica: backend 1668 unitarias, e2e de API (landing-domains 7; suite completa 112 antes de los arreglos), frontend 835, builds OK; servidor SSR compilado probado con Host ajeno (`/` → app de cliente, `/login` → 302 a `/`, `/healthz` y estáticos OK).
- spec-verifier: 7 CUMPLE · 0 PARCIAL · 1 NO VERIFICADO (C8, del usuario).
- Hallazgos corregidos: propiedad del dominio sin probar (alto → TXT con token y liberación a las 72 h); redespliegues sin tope (máx. 10 por empresa, throttle también tras fallo); impulsador podía verificar (ahora 403 y la tarjeta oculta acciones con `canManage`); `eventId` inválido daba 500 (400); dominio huérfano por `PATCH null` (ya no se admite); app completa en el dominio del cliente (redirige a `/`); sección de docs mal ubicada.
- Riesgos aceptados: quitar un dominio no redespliega (deja de servirse en el siguiente despliegue); el middleware de `server.ts` solo tiene prueba manual; `isCustomDomain()` en el navegador no conoce `NG_ALLOWED_HOSTS` extra (en producción coinciden).

## Pendiente del usuario (C8)
Crear en un dominio real el CNAME a `mayacrm.site` (o A a `SERVER_IP`) en gris y el TXT que muestra la tarjeta, pulsar «Verificar» y abrir la landing.
