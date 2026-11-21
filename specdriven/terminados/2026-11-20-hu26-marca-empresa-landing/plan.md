# HU26 — Logo y favicon de la empresa en la landing de sus eventos · Plan técnico

## Estado actual

- `backend/src/tenants/tenant.schema.ts:32` — `branding { logo, primaryColor, secondaryColor }` existe pero nadie lo usa ni lo edita.
- `backend/src/tenants/tenants.controller.ts:82` — `PATCH /tenants/me` (TENANT_ADMIN) solo edita nombre, correo, RUC y teléfono.
- `backend/src/events/events.service.ts:122` — `findPublicEvent` devuelve `{ event, registrationsCount }`, sin datos de la empresa.
- `backend/src/upload/upload.controller.ts` — `POST /upload?folder=` sube a S3 (imágenes ≤ 10 MB: jpeg/png/webp/gif).
- `frontend/src/app/pages/public-event/public-event.ts` — no toca título ni favicon; `index.html` fija el favicon de Maya.
- `frontend/src/app/pages/settings/settings.ts` — página de Configuración por tarjetas.
- `frontend/src/app/pages/events/event-domain-card.ts` — tarjeta de dominio propio (HU25).

## Diseño

- **Datos**: `branding.favicon?: string` en `Tenant`. Sin migración (campo opcional).
- **API**:
  - `PATCH /tenants/me/branding` (TENANT_ADMIN) cuerpo `{ logo?: string|null, favicon?: string|null }`; `null`/`''` borra. Valida `https://`, ≤ 2048. Devuelve `{ logo, favicon }`.
  - `GET /public/events/:slug` añade `brand: { name, logo?, favicon? }` leyendo la empresa con `select('name branding.logo branding.favicon')`.
- **Interfaz**:
  - `CompanyBrandingSettingsComponent` (`pages/settings/company-branding-settings.ts`) en `/settings`: previsualización de logo y favicon, subir (via `/upload?folder=branding`), quitar, guardar. Estados cargando/error, toast.
  - `public-event.ts`: píldora con el logo; al cargar, fija favicon (`link[rel~=icon]`) y `document.title`; los restaura en `ngOnDestroy`. Lógica de cabecera en `shared/page-brand.ts` (función pura, testeable).
  - `event-domain-card.ts`: línea con enlace a `/settings`.

## Seguridad

- Empresa siempre del JWT; `assertRole(TENANT_ADMIN)`.
- URLs solo `https://` (evita `javascript:`/`data:`); Angular sanea `[src]`.
- La respuesta pública solo lleva nombre, logo y favicon (selección explícita).

## Observabilidad

Errores de guardado devuelven mensaje claro y se muestran en toast; sin logs nuevos.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| El logo tapa partes del diseño del evento | Píldora pequeña (alto 40 px) arriba a la izquierda |
| Favicon cacheado por el navegador | Se sustituye el `href` de los `link[rel~=icon]` existentes |
| Vista previa de WhatsApp sigue con la marca de Maya | Fuera de alcance, anotado en el cierre |

## Estrategia de pruebas

- Unitarias backend: DTO (validación). e2e de API: C1–C5 en `test/branding.e2e-spec.ts`.
- Unitarias frontend: `page-brand.spec.ts` (C7, C8), `public-event.spec.ts` (C6), `company-branding-settings.spec.ts` (C9), `event-domain-card.spec.ts` (C10).
- Manual del usuario: C11.

## Fases

1. Backend (esquema, endpoint, marca en la respuesta pública) + pruebas.
2. Frontend (tarjeta, landing, aviso en dominio) + pruebas.

## ADRs

- No aplica (reutiliza `branding` y `/upload`).
