# Prospección

Módulo para encontrar, investigar y convertir empresas en clientes. Ruta `/prospeccion`, permiso `leads`.

## Flujo

1. **Búsqueda** — el usuario describe sus servicios, cliente ideal, zona y sectores. La IA genera consultas, las fuentes devuelven empresas (Google Places → Serper → IA como último recurso), se descartan las ya prospectadas y la IA puntúa el encaje (0–100). Se guardan las `maxResults` mejores.
2. **Investigación** (selección múltiple) — por empresa: ficha y reseñas de Google Maps, búsqueda en Google (web, redes, prensa), perfiles de LinkedIn de directivos, scraping de la web (portada + contacto/nosotros/equipo: tecnologías, SEO on-page, correos, teléfonos, redes), PageSpeed móvil/escritorio, Hunter (personas y correos del dominio) y una síntesis con IA (resumen, madurez digital, dolores, oportunidades, personas, cómo abordarlos).
3. **Material** (opcional) — diagnóstico por áreas, plan de mejora con ideas extra y servicios a proponer, y mensajes (correo, WhatsApp, LinkedIn, guion de llamada, seguimientos). El diagnóstico se exporta como informe PDF para el prospecto.
4. **Organización** — estados propios (nuevo, calificado, contactado, reunión, en seguimiento, descartado), notas, vista de todos los prospectos, alta directa en **Contactos** (empresa o persona, con `customFields` y etiqueta `prospección`) y en **Seguimiento** (oportunidad con la investigación y los mensajes como nota).

Todo lo lento se encola en Mongo y lo procesa `ProspectingWorker` (candado con latido, 2 intentos).

## API keys (Configuración → Prospección)

| Key | Uso | Sin ella |
|---|---|---|
| Google Places (`googlePlacesApiKey`) | Buscar empresas y leer reseñas | Se usa Serper o la IA |
| PageSpeed (`pageSpeedApiKey`) | Velocidad, SEO, accesibilidad | Se usa la de Places o la cuota anónima |
| Serper (`serperApiKey`) | Google: web, redes, LinkedIn | Se omiten esas fuentes |
| Hunter (`hunterApiKey`) | Personas y correos del dominio | Se omite |

La IA usa las keys de IA del tenant (o las del servidor).
