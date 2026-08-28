import { AngularAppEngine, createRequestHandler } from '@angular/ssr';
import {
  getAllowedHosts,
  getContext,
  getTrustProxyHeaders,
} from '@netlify/angular-runtime/app-engine.js';

/**
 * Manejador de peticiones para Netlify. El despliegue no es una máquina con
 * Node escuchando un puerto, sino una edge function, así que en lugar del
 * servidor Express que genera Angular se exporta este handler: es el que
 * `@netlify/angular-runtime` empaqueta durante el build.
 *
 * `getAllowedHosts()` y `getTrustProxyHeaders()` los aporta el runtime con los
 * dominios reales del sitio. Sin ellos Angular 21 rechazaría la cabecera `Host`
 * y degradaría a render de cliente, con lo que la landing dejaría de servirse
 * prerenderizada y perdería la indexación.
 */
const angularAppEngine = new AngularAppEngine({
  allowedHosts: getAllowedHosts(),
  trustProxyHeaders: getTrustProxyHeaders(),
});

export async function netlifyAppEngineHandler(request: Request): Promise<Response> {
  const context = getContext();
  const result = await angularAppEngine.handle(request, context);
  return result ?? new Response('Not found', { status: 404 });
}

/** Handler que usa el CLI de Angular (dev-server y build). */
export const reqHandler = createRequestHandler(netlifyAppEngineHandler);
