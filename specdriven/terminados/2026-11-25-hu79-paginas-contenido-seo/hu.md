# HU79 — Base de páginas de contenido indexables (SEO/GEO)

Como responsable de marketing de Maya CRM, quiero publicar páginas de contenido
prerenderizadas con sus etiquetas, datos estructurados y enlaces, y que el
sitemap, `llms.txt` y `llms-full.txt` se generen solos desde ese contenido, para
posicionar búsquedas de intención y que los asistentes de IA citen a Maya.
Fuente: `docs/plan-seo-geo.md`, fase 1.

- Plantilla única: respuesta al inicio, secciones, pasos, tablas, preguntas
  frecuentes, fecha de actualización, enlaces relacionados y llamada a la prueba.
- JSON-LD `Article` (o `TechArticle`), `FAQPage` y `BreadcrumbList`.
- Página índice `/recursos`. Enlaces desde el pie de la landing.
- `sitemap.xml`, `llms.txt` y `llms-full.txt` generados desde los datos.
  Se corrige `llms.txt`, que dice que no hay precios publicados.
