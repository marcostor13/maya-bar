import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const TIMEOUT_MS = 20_000;

/**
 * Da de alta un dominio corto en el proxy sin intervención manual.
 *
 * Traefik solo enruta y emite certificado para los dominios que la aplicación
 * declara en Coolify, así que registrar un dominio en la plataforma no basta:
 * hay que añadirlo a los dominios de esta app y redesplegarla para que el
 * proxy lo recoja. Eso es lo que hace este servicio, por la API de Coolify.
 *
 * Necesita `COOLIFY_URL`, `COOLIFY_TOKEN` y `COOLIFY_APP_UUID` (el UUID de
 * esta misma app). Sin ellas `enabled` es false y el alta sigue siendo manual.
 */
@Injectable()
export class ProxyDomainsService {
  private readonly logger = new Logger(ProxyDomainsService.name);
  private readonly url: string;
  private readonly token: string;
  private readonly appUuid: string;
  private readonly frontendHost: string;
  /** UUID de la app del frontend: de la variable o descubierto una vez (HU25). */
  private frontendUuid: string;
  /** Las altas van en serie: dos a la vez se pisarían la lista de dominios. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(config: ConfigService) {
    this.url = (config.get<string>('COOLIFY_URL') ?? '').replace(/\/+$/, '');
    this.token = config.get<string>('COOLIFY_TOKEN') ?? '';
    this.appUuid = config.get<string>('COOLIFY_APP_UUID') ?? '';
    this.frontendUuid = config.get<string>('COOLIFY_FRONTEND_APP_UUID') ?? '';
    this.frontendHost = hostOf(config.get<string>('FRONTEND_URL') ?? '');
  }

  get enabled(): boolean {
    return !!this.url && !!this.token && !!this.appUuid;
  }

  /** Puede dar de alta dominios en la app del frontend (landings, HU25). */
  get frontendEnabled(): boolean {
    return (
      !!this.url && !!this.token && (!!this.frontendUuid || !!this.frontendHost)
    );
  }

  /**
   * UUID de la app que sirve el frontend. Sin `COOLIFY_FRONTEND_APP_UUID` se
   * busca en Coolify la app cuyo dominio es el de `FRONTEND_URL`, así no hace
   * falta aprovisionar una variable nueva.
   */
  async frontendAppUuid(): Promise<string> {
    if (this.frontendUuid) return this.frontendUuid;
    if (!this.frontendHost) throw new Error('FRONTEND_URL no está configurado');
    const apps = (await this.request('GET', '/api/v1/applications')) as
      | { uuid?: string; fqdn?: string }[]
      | null;
    const found = (apps ?? []).find((a) =>
      (a.fqdn ?? '').split(',').some((d) => hostOf(d) === this.frontendHost),
    );
    if (!found?.uuid)
      throw new Error(
        `No hay ninguna app en Coolify con el dominio ${this.frontendHost}`,
      );
    this.frontendUuid = found.uuid;
    return found.uuid;
  }

  /**
   * Añade el dominio a la app y lanza un redespliegue. Devuelve `present` si
   * ya estaba (no redespliega) o `added` si se acaba de pedir el alta.
   */
  ensure(
    domain: string,
    appUuid: string = this.appUuid,
  ): Promise<'present' | 'added'> {
    return this.serial(async () => {
      const current = await this.currentDomains(appUuid);
      const wanted = `https://${domain}`;
      if (current.some((d) => hostOf(d) === domain)) return 'present';
      await this.request('PATCH', `/api/v1/applications/${appUuid}`, {
        domains: [...current, wanted].join(','),
      });
      await this.request('POST', `/api/v1/deploy?uuid=${appUuid}&force=false`);
      this.logger.log(
        `Dominio ${domain} añadido al proxy de la app ${appUuid}; redespliegue lanzado`,
      );
      return 'added';
    });
  }

  /**
   * Quita el dominio de la app. No redespliega: deja de servirse en el
   * siguiente despliegue, y un reinicio solo por eso no compensa.
   */
  remove(domain: string, appUuid: string = this.appUuid): Promise<void> {
    return this.serial(async () => {
      const current = await this.currentDomains(appUuid);
      const next = current.filter((d) => hostOf(d) !== domain);
      // Nunca se deja la app sin dominios: el primero es el de la plataforma.
      if (next.length === current.length || !next.length) return;
      await this.request('PATCH', `/api/v1/applications/${appUuid}`, {
        domains: next.join(','),
      });
    });
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async currentDomains(appUuid: string): Promise<string[]> {
    const app = (await this.request(
      'GET',
      `/api/v1/applications/${appUuid}`,
    )) as { fqdn?: string } | null;
    return (app?.fqdn ?? '')
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${this.url}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok)
        throw new Error(
          `El proxy respondió ${res.status}: ${text.slice(0, 200)}`,
        );
      try {
        return text ? (JSON.parse(text) as unknown) : null;
      } catch {
        return null;
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

/** `https://ir.empresa.com` → `ir.empresa.com`. */
export function hostOf(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/:].*$/, '');
}
