# HU26 — Logo y favicon de la empresa en la landing de sus eventos · Cierre

- **Cerrada:** 2026-11-20
- **Estado:** Terminada con pendientes del usuario (prueba en producción)
- **Verificación (spec-verifier):** 10 CUMPLE · 1 [usuario] (C11)
- **Commits:** sin commit

Pedido: `hu.md` · Spec: `spec.md` · Plan: `plan.md` · Tareas: `tasks.md`

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| C1 | Admin guarda logo y favicon | CUMPLE | `backend/src/tenants/tenants.controller.ts` (`PATCH me/branding`), `tenants.service.ts` `updateBranding`, `test/branding.e2e-spec.ts` C1 |
| C2 | `null` quita uno y conserva el otro | CUMPLE | `tenants.service.ts` `$unset`, e2e C2 |
| C3 | Respuesta pública solo con nombre, logo y favicon | CUMPLE | `events.service.ts` `findPublicEvent` (`select`), e2e C3, `events.service.spec.ts` |
| C4 | No admin → 403 | CUMPLE | `tenants.controller.ts`, e2e C4 |
| C5 | Solo `https://`, ≤ 2048 | CUMPLE | `UpdateBrandingDto` en `dto/create-tenant.dto.ts`, e2e C5 |
| C6 | Logo con `alt` en la landing | CUMPLE | `public-event.ts` `.pe-brand`, `public-event.spec.ts` HU26 |
| C7 | Favicon (o logo) y título en la pestaña | CUMPLE | `shared/page-brand.ts`, `page-brand.spec.ts` |
| C8 | Restaurar al salir | CUMPLE | `public-event.ts` `ngOnDestroy`, `page-brand.spec.ts`, `public-event.spec.ts` |
| C9 | Tarjeta «Marca de la empresa» | CUMPLE | `pages/settings/company-branding-settings.ts`, su `.spec.ts` |
| C10 | Aviso en la tarjeta de dominio propio | CUMPLE | `event-domain-card.ts` `.brand-hint`, `event-domain-card.spec.ts` |
| C11 | Prueba en producción | [usuario] | — |

## Qué se implementó

- `Tenant.branding.favicon` (opcional, sin migración).
- `PATCH /tenants/me/branding` (solo TENANT_ADMIN; empresa del JWT).
- `GET /public/events/:slug` devuelve `brand: { name, logo?, favicon? }`.
- `applyTabBrand` (`shared/page-brand.ts`): favicon, icono de iOS y título del evento, con restauración.
- Landing: píldora con el logo arriba a la izquierda (en `/e/:slug` y en dominio propio).
- Configuración → «Marca de la empresa»: subir/cambiar/quitar logo y favicon, guardar con toast; solo lectura para no admins.
- Tras el verificador: foco visible en el botón de subir y `apple-touch-icon` con la marca.

## Lo que tiene que hacer el usuario

- Tras el deploy: Configuración → Marca de la empresa → subir logo y favicon → abrir el link de un evento (C11).

## Pruebas

- `npm run verify` → todo OK: unitarias backend 1669/1669, e2e de API 119/119, e2e de navegador 24/24, builds y lint limpios.
- Tras las mejoras finales: `page-brand`, `public-event`, `company-branding-settings` 21/21; `npm run build` del frontend OK.

## Pendientes, riesgos y notas

- La vista previa al compartir el link (WhatsApp/redes, `og:image`) sigue con la marca de Maya: requiere renderizar la landing en el servidor. Fuera de alcance.
- El manifest PWA sigue siendo el de Maya.
- Las URLs aceptadas son cualquier `https://` (no solo el bucket propio); el admin de la empresa es responsable de lo que enlaza.
