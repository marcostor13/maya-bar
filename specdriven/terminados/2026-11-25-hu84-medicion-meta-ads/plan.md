# HU84 · Plan
- Backend: módulo `meta-ads/` (esquema `MetaCapiEvent`, `MetaCapiService` con envío, reintentos por cron y barrido de pagos aprobados). `AuthService` llama a `reportRegistration`. `RegisterTenantDto` acepta `acquisition`; `Tenant.acquisition` lo guarda. No se tocan archivos de `billing/` (el barrido lee `payments`).
- Frontend: `core/meta-tracking.service.ts` (atribución, consentimiento, píxel, escucha global de clics y de `#precios`), `shared/consent-banner.ts` en `App`, el registro adjunta la atribución y dispara `CompleteRegistration` con el `eventId` que devuelve el backend.
- `environment*.ts`: `metaPixelId`. `index.html`: meta etiqueta. Política de privacidad.
- Docs: `docs/plan-meta-ads.md` (estado) y `docs/pendientes-usuario.md` (variables `META_*`).
