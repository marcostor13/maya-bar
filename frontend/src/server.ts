import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isPlatformHost } from './app/shared/custom-domain';
import { eventMeta, injectMeta, type EventMeta } from './app/shared/event-meta';
import { CONTENT_PAGES } from './app/pages/content/content.data';
import { CONTENT_SLUGS } from './app/pages/content/content.slugs';
import { buildLlms, buildLlmsFull, buildSitemap } from './app/pages/content/seo-files';
import { environment } from './environments/environment';

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

/**
 * Vista previa de los enlaces de eventos. WhatsApp, Facebook y compañía no
 * ejecutan JavaScript: sin esto veían el título, la descripción y el logo de
 * Maya del caparazón de cliente. Se consulta el evento en la API y se ponen
 * sus etiquetas en el HTML. Si la API falla o tarda, se entrega el caparazón
 * tal cual (la página funciona igual).
 */
const API = (process.env['BACKEND_URL'] || environment.apiUrl).replace(/\/$/, '');
const META_TTL_MS = 5 * 60_000;
const metaCache = new Map<string, { at: number; meta: EventMeta | null }>();
let csrShell: string | null = null;

function shell(): string {
  csrShell ??= readFileSync(join(browserDistFolder, 'index.csr.html'), 'utf8');
  return csrShell;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2500), headers: { accept: 'application/json' } });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

async function metaFor(key: string, slug: () => Promise<string | null>, pageUrl: string): Promise<EventMeta | null> {
  const hit = metaCache.get(key);
  if (hit && Date.now() - hit.at < META_TTL_MS) return hit.meta;
  const s = await slug();
  const data = s
    ? await getJson<Parameters<typeof eventMeta>[0]>(`${API}/public/events/${encodeURIComponent(s)}`)
    : null;
  const meta = data?.event?.title ? eventMeta(data, pageUrl, environment.siteUrl) : null;
  metaCache.set(key, { at: Date.now(), meta });
  if (metaCache.size > 500) metaCache.delete(metaCache.keys().next().value as string);
  return meta;
}

function sendShell(res: express.Response, meta: EventMeta | null) {
  res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
  res.type('html').send(meta ? injectMeta(shell(), meta) : shell());
}

/** Sonda de salud para el healthcheck del contenedor: no pasa por Angular. */
app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

/**
 * Archivos de nombre fijo que NO pueden heredar el `maxAge: '1y'` de los assets
 * hasheados: como la URL nunca cambia, el navegador se quedaría con la versión
 * del despliegue anterior. Al service worker y al manifest les costaría dejar
 * de recibir notificaciones; al favicon y a los iconos, seguir mostrando el
 * icono viejo durante un año. Se sirven antes que el `express.static` general,
 * revalidando en cada carga.
 */
app.get(
  [
    '/sw.js',
    '/manifest.webmanifest',
    '/favicon.ico',
    '/icons/:file',
    // El logo y el isotipo también tienen nombre fijo: con el año de caché,
    // un cambio de marca no se veía hasta que el navegador lo descartara.
    '/logo.png',
    '/logo-light.png',
    '/logo.svg',
    '/isotipo.svg',
  ],
  (req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
    if (req.path === '/sw.js') {
      // Permite que el SW controle toda la app aunque se sirva desde /sw.js.
      res.setHeader('Service-Worker-Allowed', '/');
    }
    // `root` en vez de join(): Express rechaza por sí mismo cualquier ruta que
    // intente escaparse del directorio servido.
    res.sendFile(req.path, { root: browserDistFolder }, (err) =>
      err ? next() : undefined,
    );
  },
);

/**
 * Dominio propio de un cliente (HU25): ahí la raíz es la landing de un evento,
 * no la de marketing, así que no se entrega la página prerenderizada sino la
 * app de cliente, que busca el evento por el host. Cualquier otra ruta vuelve
 * a la raíz. Lo que lleva extensión
 * (JS, CSS, imágenes) sigue al `express.static` de abajo.
 */
/**
 * SEO: `www.` es la misma web; sin redirigir, el buscador ve dos copias.
 * El dominio principal sale de `siteUrl`.
 */
const SITE_HOST = new URL(environment.siteUrl).host;
app.use((req, res, next) => {
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0].trim().toLowerCase();
  if (host === `www.${SITE_HOST}`) res.redirect(301, `https://${SITE_HOST}${req.originalUrl}`);
  else next();
});

app.use((req, res, next) => {
  const forwarded = String(req.headers['x-forwarded-host'] ?? '').split(',')[0].trim();
  const host = forwarded || req.headers.host || '';
  if (isPlatformHost(host, extraAllowedHosts) || /\.[a-z0-9]+$/i.test(req.path)) return next();
  // En el dominio del cliente solo existe la landing: nada de /login ni del
  // resto de la app bajo su marca.
  if (req.path !== '/') return res.redirect(302, '/');
  const h = host.toLowerCase().replace(/:\d+$/, '');
  metaFor(
    `host:${h}`,
    async () =>
      (await getJson<{ slug: string }>(`${API}/public/landing-domains/resolve?host=${encodeURIComponent(h)}`))?.slug ?? null,
    `https://${h}/`,
  )
    .then((meta) => sendShell(res, meta))
    .catch(next);
});

/** Página pública de un evento (`/e/:slug`) con su vista previa. */
app.get('/e/:slug', (req, res, next) => {
  const slug = String(req.params['slug']);
  metaFor(`slug:${slug}`, async () => slug, `${environment.siteUrl.replace(/\/$/, '')}/e/${encodeURIComponent(slug)}`)
    .then((meta) => sendShell(res, meta))
    .catch(next);
});

/**
 * Landing prerenderizada. `app.routes.server.ts` la declara como
 * `RenderMode.Prerender` y el build la escribe en `browser/index.html`
 * (`prerendered-routes.json` lista `/`), pero en el contenedor el motor de
 * Angular devolvía para `/` el caparazón de cliente: 13 KB sin `<h1>` ni
 * `ng-server-context`, mientras `/index.html` sí servía los 121 KB
 * prerenderizados. Fuera del contenedor no se reproduce, así que en vez de
 * depender del motor se entrega el archivo directamente, que es justo lo que
 * `Prerender` significa. Sin esto la landing no es indexable.
 *
 * No lleva el `maxAge: '1y'` del `express.static` de abajo: la URL es fija y
 * el contenido cambia en cada despliegue.
 */
app.get('/', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
  res.sendFile('index.html', { root: browserDistFolder }, (err) =>
    err ? next() : undefined,
  );
});

/**
 * Sitemap y archivos para asistentes de IA (HU79), generados desde las páginas
 * de contenido: nunca quedan desactualizados. `llms.txt` parte del texto base
 * de `public/llms.txt`.
 */
const SEO_FILES_CACHE = 'public, max-age=3600';
/** En el dominio propio de un cliente estos archivos no existen: son de mayacrm.site. */
app.use(['/sitemap.xml', '/llms.txt', '/llms-full.txt'], (req, res, next) => {
  const host = String(req.headers['x-forwarded-host'] ?? '').split(',')[0].trim() || req.headers.host || '';
  if (isPlatformHost(host, extraAllowedHosts)) next();
  else res.status(404).end();
});
app.get('/sitemap.xml', (_req, res) => {
  res.setHeader('Cache-Control', SEO_FILES_CACHE);
  res.type('application/xml').send(buildSitemap(environment.siteUrl, CONTENT_PAGES));
});
let llmsBase: string | null = null;
app.get('/llms.txt', (_req, res) => {
  llmsBase ??= readFileSync(join(browserDistFolder, 'llms.txt'), 'utf8');
  res.setHeader('Cache-Control', SEO_FILES_CACHE);
  res.type('text/plain').send(buildLlms(llmsBase, environment.siteUrl, CONTENT_PAGES));
});
app.get('/llms-full.txt', (_req, res) => {
  res.setHeader('Cache-Control', SEO_FILES_CACHE);
  res.type('text/plain').send(buildLlmsFull(environment.siteUrl, CONTENT_PAGES));
});

// Páginas prerenderizadas (`app.routes.server.ts`): `express.static` con
// `index: false` no abre `privacidad/index.html`, así que se sirven a mano.
const PRERENDERED = ['/privacidad', '/terminos', '/eliminacion-datos', '/recursos', ...CONTENT_SLUGS.map((s) => `/${s}`)];
app.get(PRERENDERED, (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
  res.sendFile(join(req.path.slice(1), 'index.html'), { root: browserDistFolder }, (err) =>
    err ? next() : undefined,
  );
});

app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

// Un archivo que no existe es 404 (antes devolvía la app con 200: "soft 404").
app.use((req, res, next) => {
  if (/\.[a-z0-9]+$/i.test(req.path)) {
    res.status(404).type('text/plain').send('No encontrado');
    return;
  }
  // El resto de rutas es la app con sesión: no se indexa.
  res.setHeader('X-Robots-Tag', 'noindex');
  next();
});

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
