# HU79 — Base de páginas de contenido indexables · Especificación
Historia: `hu.md` · Fecha: 2026-11-25 · Estado: aprobada (pedido del usuario: "ejecuta el plan de seo", "crea las hus e impleméntalas")

## Requisitos (EARS)
- **R1** — Cada página de contenido se sirve prerenderizada (HTML con `<h1>`, respuesta, secciones y FAQ sin JavaScript), con `<title>`, descripción, canónica, Open Graph y JSON-LD `Article`/`TechArticle`, `BreadcrumbList` y `FAQPage`.
- **R2** — `/recursos` lista todas las páginas agrupadas por tipo; el pie de la landing enlaza las funciones y `/recursos`.
- **R3** — `sitemap.xml`, `llms.txt` (base + precios + índice) y `llms-full.txt` se generan desde los datos; `llms.txt` ya no dice que no hay precios.
- **R4** — Precios y límites citados salen del catálogo generado del backend.
- **R5** — Diseño: variables de `styles.scss`, íconos lucide, sin scroll horizontal a 390 px.

## Criterios de aceptación
| # | Req. | Criterio | Verificación |
|---|---|---|---|
| C1 | R1 | Rutas = datos; estructura (título ≤70, descripción 70–160, respuesta, ≥3 FAQ, relacionadas existentes) | `content.spec.ts` |
| C2 | R1 | Render: h1, respuesta, tabla, FAQ, JSON-LD y canónica | `content.spec.ts` + build (21 rutas prerenderizadas) |
| C3 | R3 | Sitemap con landing, recursos, legales y cada página; llms con precios e índice; llms-full con todo | `content.spec.ts` + servidor local |
| C4 | R4 | Precios = catálogo; sin plan Empresa | `content.spec.ts` |
| C5 | R2, R5 | Pie de la landing y vista móvil | revisión en navegador (scrollWidth 378 a 390 px) |
