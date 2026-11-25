import { RenderMode, ServerRoute } from '@angular/ssr';
import { CONTENT_SLUGS } from './pages/content/content.slugs';

/**
 * Se prerenderizan solo las páginas públicas e indexables: la landing, las
 * legales, `/recursos` y las páginas de contenido (HU79). El resto de la
 * aplicación vive detrás del login y depende de `localStorage`, así que se
 * entrega como CSR — renderizarla en el servidor no aportaría SEO y sí
 * rompería la sesión.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  // Legales: Meta y sus revisores deben leerlas sin ejecutar JavaScript.
  { path: 'privacidad', renderMode: RenderMode.Prerender },
  { path: 'terminos', renderMode: RenderMode.Prerender },
  { path: 'eliminacion-datos', renderMode: RenderMode.Prerender },
  // Contenido indexable (HU79): buscadores e IA lo leen sin JavaScript.
  { path: 'recursos', renderMode: RenderMode.Prerender },
  ...CONTENT_SLUGS.map((path) => ({ path, renderMode: RenderMode.Prerender as const })),
  { path: '**', renderMode: RenderMode.Client },
];
