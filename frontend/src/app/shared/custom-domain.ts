import { environment } from '../../environments/environment';

/**
 * Dominios propios de las landings (HU25). Un host que no es de la plataforma
 * es el dominio de un cliente: su raíz muestra la landing de un evento.
 *
 * Lo usan el router en el navegador y `server.ts` en el servidor, así que no
 * depende de Angular.
 */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

const site = hostOf(environment.siteUrl ?? '');
const PLATFORM_HOSTS = new Set(
  [
    'localhost',
    '127.0.0.1',
    'mayacrm.site',
    'www.mayacrm.site',
    site,
    site && !site.startsWith('www.') ? `www.${site}` : '',
  ].filter(Boolean),
);

/** `extra`: hosts propios adicionales (en el servidor, `NG_ALLOWED_HOSTS`). */
export function isPlatformHost(host: string, extra: readonly string[] = []): boolean {
  const h = (host ?? '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (!h) return true;
  return PLATFORM_HOSTS.has(h) || extra.some((e) => e.toLowerCase() === h);
}

let hostOverride: string | null = null;

/** Host actual del navegador ('' en el servidor). */
export function currentHost(): string {
  if (hostOverride !== null) return hostOverride;
  return typeof window !== 'undefined' ? window.location.hostname : '';
}

/** En el navegador: ¿estamos en el dominio propio de un cliente? */
export function isCustomDomain(): boolean {
  const host = currentHost();
  return !!host && !isPlatformHost(host);
}

/** Solo para pruebas: simula estar en otro host (`null` vuelve al real). */
export function setHostForTests(host: string | null): void {
  hostOverride = host;
}
