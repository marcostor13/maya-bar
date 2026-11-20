# HU25 — Plan

Backend (`backend/src/links/`, junto a los dominios cortos y `ProxyDomainsService`):
- `landing-domain.schema.ts`: `LandingDomain` {tenantId, domain único, eventId, status, activationRequestedAt, checkedAt, checkMessage, resolvedTo, createdBy}.
- `proxy-domains.service.ts`: `ensure`/`remove` aceptan el UUID de la app; `frontendAppUuid()` (env o descubrimiento por `FRONTEND_URL`).
- `landing-domains.service.ts`: list/add/verify/assign/remove/resolve; DNS con `resolve4`, ping a `/healthz`.
- `landing-domains.controller.ts`: `landing-domains` (JWT + `EVENT_ROLES`) y `public/landing-domains/resolve`.
- `links.service.ts`: rechazar dominio de links que ya sea de landing.
- `app.setup.ts`: CORS abierto para `/public/events` y `/public/landing-domains`.

Frontend:
- `shared/custom-domain.ts`: `isPlatformHost(host)` y `isCustomDomain()`.
- `server.ts`: host ajeno → `index.csr.html` para rutas sin extensión.
- `app.routes.ts`: ruta `''` con `canMatch` de dominio propio → `PublicEventComponent`.
- `public-event.ts`: sin slug, resuelve por host.
- `pages/events/event-domain-card.ts` en la pestaña Marketing.

Docs: `docs/deploy.md` (sección dominios de landing). Pruebas: unitarias del servicio, e2e de API, helper de host, tarjeta, landing por host.
