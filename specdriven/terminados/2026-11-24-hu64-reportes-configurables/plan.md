# HU64 — Plan
- `src/reports/report-definition.ts`: catálogo permitido por fuente, `resolveRange` (Lima, tope 366 días), `validateDefinition` (+ unitarias).
- `report.schema.ts` (`reports`), `reports.service.ts` (agregación con `$dateToString` en `America/Lima`, etiquetas de vendedores y eventos, visibilidad por rol, CRUD, fijados, CSV, envío programado con `@Cron`), `reports.controller.ts` (`/reports/*`, permiso del dashboard, auditoría HU63), `reports.module.ts`.
- Frontend: `pages/reports/report-view.ts` (tabla/barras/línea sin librerías), `reports.ts` (lista + constructor en `app-form-page`), `pinned-reports-card.ts` en el dashboard, ruta `/reportes` y menú.
