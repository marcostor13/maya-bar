# HU26 — Logo y favicon de la empresa en la landing de sus eventos · Tareas

- [x] T1 — `branding.favicon` en el esquema, `UpdateBrandingDto`, `PATCH /tenants/me/branding` y `TenantsService.updateBranding` → C1, C2, C4, C5 · prueba: e2e de API
- [x] T2 — `brand` en `GET /public/events/:slug` → C3 · prueba: e2e de API + unitaria `events.service.spec`
- [x] T3 — `shared/page-brand.ts` (favicon + título con restauración) → C7, C8 · prueba: `page-brand.spec.ts`
- [x] T4 — Landing: píldora de logo y uso de `page-brand` → C6, C7, C8 · prueba: `public-event.spec.ts`
- [x] T5 — Tarjeta «Marca de la empresa» en Configuración → C9 · prueba: `company-branding-settings.spec.ts`
- [x] T6 — Aviso en la tarjeta de dominio propio → C10 · prueba: `event-domain-card.spec.ts`
- [x] T7 — Verificación mecánica (`npm run verify`)
- [x] T8 — Verificación independiente (`spec-verifier`)
- [x] T9 — Archivar en `terminados/` y actualizar el índice
