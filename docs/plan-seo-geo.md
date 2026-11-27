# SEO y GEO de mayacrm.site — diagnóstico y plan de campaña

Fecha: 25-11-2026. GEO = aparecer citado en respuestas de ChatGPT, Gemini,
Perplexity, Claude y los resúmenes con IA de Google.

## 1. Diagnóstico (auditado en producción)

### Lo que ya está bien
- Landing `/` prerenderizada: el HTML trae el `<h1>`, 15 `<h2>` y unas 3 300 palabras.
- Título, descripción, `robots: index`, Open Graph, Twitter y canónica correctos.
- `lang="es"`, `http → https` y HTML comprimido con gzip.
- Datos estructurados: `SoftwareApplication`, `FAQPage` y `WebSite`.
- `robots.txt` bloquea las pantallas de sesión y declara el sitemap.
- `llms.txt` publicado (≈ 4 KB, describe módulos y uso).
- Los rastreadores de IA (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, OAI-SearchBot) no están bloqueados.
- Las imágenes tienen `alt`.
- Los enlaces de eventos ya muestran su propia vista previa (título, fecha, portada).

### Problemas encontrados y corregidos hoy
| Problema | Efecto | Corrección |
|---|---|---|
| `www.mayacrm.site` respondía 200 | Contenido duplicado | 301 a `mayacrm.site` (`server.ts`) |
| Cualquier URL inexistente (`/llms-full.txt`, `/.well-known/security.txt`) devolvía la app con 200 | "Soft 404": Google indexa basura | Archivo inexistente → 404 |
| Las rutas de la app (checkout, formularios internos…) se podían indexar | Páginas vacías en el índice | Cabecera `X-Robots-Tag: noindex` en todo lo que no es landing, legales ni eventos |
| Legales sin canónica ni Open Graph propios | Señales mezcladas con la landing | `SeoService` en `legal.ts` |
| Sitemap con una sola URL y sin `lastmod` | Rastreo pobre | Sitemap con `/`, legales y `lastmod` |
| `og:image` era el logo (930×254) | Vista previa pequeña o recortada al compartir | `og-image.png` 1200×630 |
| Sin entidad `Organization` | Los buscadores y las IA no conectan la marca con su dirección ni su país | JSON-LD `Organization` con dirección en Lima |
| `og:locale es_ES` | Señal de España, no de LatAm | `es_PE` |

### Lo que no está al 100% (requiere contenido o acciones externas)
1. **Una sola página indexable con contenido.** Es el límite principal: no hay
   páginas por intención de búsqueda, comparativas, casos ni blog. Con una
   página no se posiciona más que la marca.
2. **Search Console y Bing Webmaster Tools.** No se puede comprobar desde aquí
   si están verificados y si el sitemap está enviado. Bing alimenta a ChatGPT
   Search y Copilot.
3. **Presencia de la marca fuera del sitio.** Las IA citan lo que aparece en
   varias fuentes: directorios (G2, Capterra, GetApp, Product Hunt), LinkedIn,
   YouTube, Reddit, notas de prensa. Hoy Maya CRM no figura en ninguna fuente
   verificable, así que el JSON-LD `Organization` no lleva `sameAs`.
4. **Reseñas y prueba social** con datos verificables (clientes, números).
5. **HSTS** no está activo (cabecera `Strict-Transport-Security` en el proxy de Coolify).
6. **Páginas de eventos públicos** fuera del sitemap. Conviene un sitemap dinámico
   solo si los clientes quieren que sus eventos se encuentren en Google.

## Estado de ejecución (2026-11-25)
- Hecho (HU79–HU83): plantilla prerenderizada, `/recursos`, 6 funciones, 4 industrias, 4 comparativas, 2 guías; sitemap, `llms.txt` y `llms-full.txt` generados desde los datos; enlaces en el pie de la landing.
- Diferencia con el plan: las páginas tienen 400–700 palabras, no 1 200–1 800. Ampliarlas solo con datos reales (casos, capturas, tiempos medidos).
- Pendiente del usuario: Search Console/Bing, perfiles de marca, HSTS, caso de cliente real y revisión trimestral de precios de la competencia (`docs/pendientes-usuario.md`).
- Siguiente: medir 4–6 semanas en Search Console antes de añadir más páginas; panel mensual de 30 preguntas en asistentes de IA.

## Estado (2026-11-27)
- Search Console verificado (dominio, TXT en Cloudflare). Sitemap enviado: 21 URL leídas. La portada ya estaba indexada; `/crm-whatsapp` figuraba "Descubierta: sin indexar". Indexación pedida: `/`, `/crm-whatsapp`, `/agentes-ia-whatsapp`, `/campanas-whatsapp`, `/comparar/kommo`, `/comparar/hubspot`, `/recursos`. El informe de páginas estará al día siguiente.
- HSTS activo (`max-age=31536000`, desde `server.ts`, solo en mayacrm.site).
- Bing Webmaster: pendiente de inicio de sesión del usuario.
- LinkedIn: página "Maya CRM" preparada, falta la confirmación del representante.

### Panel GEO — primera medición (2026-11-27)
| Pregunta | Asistente | ¿Menciona Maya? | Quién aparece |
|---|---|---|---|
| Mejor CRM con WhatsApp e IA para una pyme en Perú | ChatGPT (con búsqueda) | No | Kommo, IRENE, Respond.io, Leadsales, JAM CRM, Zoho, HubSpot |
| Alternativa barata a HubSpot en español con WhatsApp | ChatGPT | No | Kommo, Clientify, Bitrix24, Zoho, Leadsales |
| Chatbot con IA para WhatsApp Business que venda, Perú | ChatGPT | No | VozIA, WATI, Manychat, Respond.io |
| ¿Qué es Maya CRM (mayacrm.site)? | ChatGPT | Sí | Describe bien módulos y precios, pero dice "14 días de prueba sin tarjeta" (dato viejo) y recomienda precaución por falta de reputación pública |
| Mejor CRM con WhatsApp e IA en Perú + ¿conoces Maya CRM? | Gemini | Solo por nombre | Kommo y otros en la lista; a Maya la describe bien como "producto nuevo / emergente" |

Lectura: los asistentes ya leen mayacrm.site, pero sin fuentes externas no la recomiendan. Fuentes que citan: kommo.com, leadsales, whaticket, JAM CRM, publicita, pmsuite. Prioridad: perfiles de marca, Bing (para que ChatGPT actualice el dato de la prueba), listados "mejores CRM para WhatsApp" y reseñas. Perplexity exige cuenta para preguntar.

## 2. Plan de campaña SEO + GEO (90 días)

### Objetivo
Posicionar Maya CRM en las búsquedas de intención comercial de LatAm sobre
CRM con WhatsApp e IA, y que los asistentes de IA la mencionen cuando alguien
pregunte por esas herramientas.

**Indicadores**
- Impresiones y clics en Search Console.
- Palabras clave en el top 10.
- Demos pedidas y pagos que llegan por orgánico.
- Menciones en un panel fijo de 30 preguntas, medido cada mes en ChatGPT,
  Gemini, Perplexity y Claude.

### Grupos de palabras clave (español LatAm)
| Grupo | Ejemplos | Página destino |
|---|---|---|
| CRM + WhatsApp | crm para whatsapp, crm con whatsapp business, whatsapp crm perú | `/crm-whatsapp` |
| IA en WhatsApp | chatbot whatsapp con ia, agente de ia para ventas, responder whatsapp automático | `/agentes-ia-whatsapp` |
| Campañas | envío masivo whatsapp, campañas whatsapp api oficial, mailing y whatsapp | `/campanas-whatsapp` |
| Captación | formulario que envía a whatsapp, registro de eventos con qr, landing de evento | `/formularios`, `/eventos` |
| Bandeja | bandeja unificada whatsapp instagram, varios vendedores un whatsapp | `/bandeja-unificada` |
| Comparativas | alternativa a hubspot, kommo vs, leadsales alternativa, crm barato latam | `/comparar/*` |
| Industria | crm para inmobiliarias, crm para academias, crm para clínicas, crm para eventos | `/industrias/*` |

### Fase 1 (semanas 1–2): base
1. Verificar Search Console y Bing Webmaster y enviar el sitemap. Pedir la indexación de `/`.
2. Crear perfiles con datos idénticos (nombre, descripción corta, logo, web):
   LinkedIn Company, YouTube, Product Hunt, G2, Capterra/GetApp y Google Business
   Profile (Lima). Después, añadir esas URL como `sameAs` en el JSON-LD `Organization`.
3. Activar HSTS en el proxy.
4. Plantilla de página de contenido prerenderizada (Angular `RenderMode.Prerender`),
   con `SeoService`, JSON-LD `Article`/`FAQPage`/`BreadcrumbList` y enlaces
   internos. Cada URL nueva entra en el sitemap y en `llms.txt`.

### Fase 2 (semanas 3–6): páginas de producto e intención
- 6 páginas de función (tabla de arriba), de 1 200 a 1 800 palabras cada una.
- Estructura "respuesta primero", que es la que las IA extraen:
  1. Definición de 2 o 3 frases al inicio.
  2. Pasos numerados y una tabla de comparación o de precios.
  3. FAQ de 5 preguntas reales.
  4. Fecha de actualización visible.
- Datos citables y verificables: precios, límites de la API de WhatsApp,
  tiempos de respuesta medidos en clientes. No inventar estadísticas.
- Generar `llms-full.txt` con el texto de todas las páginas.

### Fase 3 (semanas 5–10): comparativas e industrias
- 4 comparativas honestas: Maya vs HubSpot, vs Kommo, vs Leadsales y vs Wati.
  Cada una con tabla de funciones y precios en PEN/USD, para quién conviene cada
  una y su fecha de revisión. Son las páginas que más citan las IA en preguntas
  del tipo "¿qué CRM uso para…?".
- 4 páginas por industria con un caso concreto: el flujo completo
  formulario → WhatsApp → IA → campaña.
- 1 caso de cliente real con números y su permiso.

### Fase 4 (semanas 6–12): blog de guías y autoridad
- 2 guías al mes de búsqueda informativa, por ejemplo:
  - Cómo migrar de WhatsApp Business a la API oficial.
  - Plantillas de WhatsApp aprobadas por Meta: guía.
  - Cuánto cuesta enviar mensajes de WhatsApp en Perú (2026).
  - Cómo responder leads de Meta Ads en menos de 5 minutos.
- Cada guía enlaza a su página de función y termina con la invitación a la demo por WhatsApp (sin prueba gratis desde HU87).
- Distribución:
  - Resumen en LinkedIn.
  - Video corto en YouTube y Reels con el mismo título.
  - Respuesta útil en Reddit o foros cuando alguien pregunta, sin spam.
- Enlaces externos: notas en medios de emprendimiento de Perú y LatAm, podcasts,
  alianzas con agencias de Meta Ads (página de partners con enlace recíproco)
  y aparición en listados "mejores CRM para WhatsApp".

### Medición mensual
- Search Console: impresiones, CTR y posición por grupo de palabras clave.
  Las páginas con muchas impresiones y CTR bajo se reescriben (título y descripción).
- GA4: registros y compras con `source=organic`. Referidos de `chatgpt.com`,
  `perplexity.ai`, `gemini.google.com` y `copilot.microsoft.com`.
- Panel GEO: las mismas 30 preguntas cada mes, con un registro de en qué
  asistente aparece Maya, en qué posición y con qué fuente citada. Ejemplos:
  - "mejor CRM con WhatsApp para Perú"
  - "alternativa barata a HubSpot en español"
  - "chatbot con IA para WhatsApp Business"
- Las fuentes citadas que no son nuestras indican dónde conseguir presencia.

### Responsables
- Técnico (plantillas, sitemap, JSON-LD, `llms-full.txt`): desarrollo.
- Contenido: 6 páginas de función + 4 comparativas + 4 industrias + 6 guías ≈ 20
  piezas en 90 días.
- Perfiles, directorios, prensa y alianzas: marketing.
