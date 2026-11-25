# HU79 — Base de páginas de contenido indexables · Cierre
Fecha: 2026-11-25 · Estado: **Terminada**

## Qué se hizo
- `frontend/src/app/pages/content/`: modelo `ContentPage`, rutas (`content.slugs.ts`), datos, `facts.ts` (precios, límites y complementos del catálogo generado del backend; tarifas de Meta para Perú; formato único de números), `seo-files.ts`, plantilla `content-page.ts` (JSON-LD Article/TechArticle, BreadcrumbList, FAQPage; canónica y OG), `content-shell.ts` y `/recursos`.
- 16 páginas + `/recursos` prerenderizadas (21 rutas con la landing y las legales).
- `server.ts`: `/sitemap.xml`, `/llms.txt` (base + precios + índice) y `/llms-full.txt` generados desde los datos; 404 en dominios propios de clientes. Se borró `public/sitemap.xml`; `public/llms.txt` ya publica precios.
- Landing: columna "Recursos" en el pie. Logo oscuro en la cabecera clara de contenido y legales.

## Verificación
- `content.spec.ts` 9/9; suite frontend 1048/1048; lint sin errores; build con 21 rutas prerenderizadas.
- Servidor local: 21 URL en el sitemap; `llms-full.txt` 37 KB; sitemap/llms 404 con `Host` de cliente.
- Navegador: escritorio y 390 px sin scroll horizontal (scrollWidth 378); pie de la landing revisado.
- spec-verifier: C1–C3 CUMPLE; C4 PARCIAL (límites copiados a mano) y C5 sin evidencia → corregidos: límites leídos del catálogo con prueba; evidencia de móvil arriba.
