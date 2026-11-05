import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Solo la landing se renderiza en el servidor: es la única página que necesita
 * ser indexable. El resto de la aplicación vive detrás del login y depende de
 * `localStorage`, así que se entrega como CSR — renderizarla en el servidor no
 * aportaría SEO y sí rompería la sesión.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  // Legales: Meta y sus revisores deben leerlas sin ejecutar JavaScript.
  { path: 'privacidad', renderMode: RenderMode.Prerender },
  { path: 'terminos', renderMode: RenderMode.Prerender },
  { path: 'eliminacion-datos', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];
