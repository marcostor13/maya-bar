# HU56 · Plan
- `frontend/scripts/sync-catalog.mjs` (esbuild) → `src/app/shared/catalog.generated.json`; scripts `catalog` y `catalog:check`; paso en `scripts/verify.js`.
- `tsconfig.json`: `resolveJsonModule`.
- `landing.data.ts`: `pricesOf`, `limitOf`, `setupPrice`, `fmt`; ADDONS desde el catálogo; FAQ de precios con plantilla.
- `landing.ts`: periodo trimestral, `periodParam()`, CTA principal al checkout, `perMonth` y `billedNote` por periodo, JSON-LD desde `prices`.
- Pruebas: `landing.spec.ts` (4).
