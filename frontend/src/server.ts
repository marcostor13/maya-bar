import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

/**
 * Servidor SSR de la aplicación. El despliegue es un contenedor Node en Coolify
 * detrás de Traefik, así que aquí se levanta un Express real escuchando un
 * puerto, no un handler de edge function.
 *
 * `trustProxyHeaders` es imprescindible: Traefik termina TLS y reenvía la
 * petición por HTTP, de modo que sin honrar `X-Forwarded-Host`/`-Proto` Angular
 * reconstruiría URLs `http://<ip-interna>` y rechazaría el host, degradando a
 * render de cliente y perdiendo la landing prerenderizada.
 *
 * Los hosts permitidos salen de `angular.json`
 * (`build.options.security.allowedHosts`) y se pueden ampliar en runtime con
 * `NG_ALLOWED_HOSTS` (lista separada por comas).
 */
const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();

const extraAllowedHosts = (process.env['NG_ALLOWED_HOSTS'] ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

const angularApp = new AngularNodeAppEngine({
  trustProxyHeaders: true,
  ...(extraAllowedHosts.length ? { allowedHosts: extraAllowedHosts } : {}),
});

/** Sonda de salud para el healthcheck del contenedor: no pasa por Angular. */
app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

if (isMainModule(import.meta.url)) {
  const port = Number(process.env['PORT'] ?? 4000);
  // Sin host explícito Node escucha en dual-stack (::  + 0.0.0.0). Es lo que
  // necesita el healthcheck del contenedor: el wget de busybox resuelve
  // `localhost` a ::1 y con bind solo a 0.0.0.0 recibía "connection refused".
  app.listen(port, () => {
    console.log(`[ssr] servidor Angular escuchando en http://0.0.0.0:${port}`);
  });
}

/** Handler que usa el CLI de Angular (dev-server y build). */
export const reqHandler = createNodeRequestHandler(app);
