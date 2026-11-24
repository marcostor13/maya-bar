# HU56 — Precios nuevos en la landing · Spec

## Alcance
- **Fuente única:** el catálogo del backend.
  - Archivos: `plans.catalog.ts`, `addons.catalog.ts` y `setup.catalog.ts`.
  - `frontend/scripts/sync-catalog.mjs` los transpila con esbuild y escribe `src/app/shared/catalog.generated.json`, que se versiona porque la imagen Docker del frontend se construye sin el backend.
  - Comandos: `npm run catalog` regenera el archivo; `npm run catalog:check` falla si está desfasado (es un paso de `npm run verify`).
- **`landing.data.ts`** importa el JSON (con `resolveJsonModule`) y saca de él:
  - los precios de cada plan, por moneda y periodo;
  - los límites mostrados;
  - los add-ons;
  - el precio de los paquetes de implementación;
  - la FAQ de precios.
  - Así el prerender trae los precios en el HTML.
- **Selector de periodo:** Mensual, Trimestral (−5 %) y Anual (2 meses gratis).
  - En trimestral y anual se muestra el equivalente por mes y el total del periodo, con el ahorro.
- **Botones de cada plan:**
  - principal "Contratar <plan>" → `/checkout?plan=…&periodo=mensual|trimestral|anual&moneda=…`;
  - secundario "o prueba 14 días gratis" → registro.
- **Contenido de los planes:**
  - Inicia: "1 evento activo" y "Prospección con IA (usa créditos)".
  - Escala: la recuperación de clientes pasa a servicio, "Campaña de recuperación llave en mano: S/ 690 por campaña", hasta HU66.
- **Puesta en marcha:** "Se descuenta del plan anual (hasta el 10 % del año)"; viene de HU55.
- **Contador de cupos fundador:** ya existe desde HU54.
- **Moneda por defecto:** soles con la zona horaria `America/Lima`, igual que ahora. El prerender sale en dólares, y la FAQ y el JSON-LD traen también los soles.

## Criterios de aceptación
- **C1:** el HTML prerenderizado contiene "S/ 99" y "S/ 249".
- **C2:** el botón de Crece en anual lleva a `/checkout?plan=crece&periodo=anual`.
- **C3:** si se cambia un precio en el catálogo y se vuelve a generar el build (`npm run catalog`), la landing cambia sin tocar `landing.data.ts`.
