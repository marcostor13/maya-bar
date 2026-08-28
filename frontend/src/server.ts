import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

/**
 * Angular 21 rechaza toda petición cuyo `Host` no esté en la lista blanca y cae
 * a render de cliente, con lo que la landing dejaría de servirse prerenderizada.
 * La lista base viene de `angular.json`; esta variable permite añadir dominios
 * en el despliegue sin volver a compilar.
 */
const extraHosts = (process.env['ALLOWED_HOSTS'] ?? '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

/**
 * Detrás de un proxy inverso (nginx, Cloudflare) llegan cabeceras `X-Forwarded-*`.
 * Si no se declaran como fiables, Angular también degrada a render de cliente.
 */
const trustProxyHeaders = process.env['TRUST_PROXY_HEADERS'] === 'true';

const app = express();
const angularApp = new AngularNodeAppEngine({
  allowedHosts: extraHosts,
  trustProxyHeaders,
});

/** Estáticos del build de navegador. */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/** El resto lo resuelve Angular: landing prerenderizada o shell de cliente. */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, () => {
    console.log(`Maya SSR escuchando en http://localhost:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
