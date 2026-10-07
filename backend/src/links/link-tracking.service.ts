import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { LinkClick, ShortDomain, ShortLink } from './link.schemas';
import { clientIp, parseCookies, parseUserAgent } from './user-agent';
import { isPrivateAddress } from '../shared/network';

/** Cookie propia del dominio corto que identifica al navegador. */
export const VISITOR_COOKIE = 'mlv';
const VISITOR_MAX_AGE = 60 * 60 * 24 * 365;
const DOMAIN_CACHE_MS = 60_000;
const GEO_CACHE_MAX = 5_000;
/** Clics de una misma IP sobre un mismo link que se registran por minuto. */
const MAX_CLICKS_PER_MINUTE = 20;

interface Geo {
  country?: string;
  city?: string;
}

/**
 * Resolución de links cortos y registro de clics. Es el camino caliente y es
 * público: nunca debe lanzar ni retrasar la redirección por culpa del registro.
 */
@Injectable()
export class LinkTrackingService implements OnModuleInit {
  private readonly logger = new Logger(LinkTrackingService.name);
  private domains = new Set<string>();
  private domainsLoadedAt = 0;
  private readonly geoUrl: string;
  private geoCache = new Map<string, Geo>();
  /** Clics registrados por IP y link en el minuto en curso. */
  private hits = new Map<string, number>();
  private hitsWindow = 0;

  constructor(
    @InjectModel(ShortLink.name) private linkModel: Model<ShortLink>,
    @InjectModel(LinkClick.name) private clickModel: Model<LinkClick>,
    @InjectModel(ShortDomain.name) private domainModel: Model<ShortDomain>,
    config: ConfigService,
  ) {
    this.geoUrl = config.get<string>('GEOIP_URL') ?? '';
  }

  async onModuleInit() {
    await this.refreshDomains();
  }

  /** True si el host es un dominio corto registrado (en cualquier estado). */
  async isShortDomain(host: string): Promise<boolean> {
    if (Date.now() - this.domainsLoadedAt > DOMAIN_CACHE_MS)
      await this.refreshDomains();
    return this.domains.has(host.toLowerCase());
  }

  /** Tras registrar o borrar un dominio no se espera al siguiente refresco. */
  async refreshDomains(): Promise<void> {
    try {
      const rows = await this.domainModel.find({}, { domain: 1 }).lean().exec();
      this.domains = new Set(rows.map((r) => r.domain));
      this.domainsLoadedAt = Date.now();
    } catch (err) {
      this.logger.warn(
        `No se pudieron cargar los dominios cortos: ${String(err)}`,
      );
    }
  }

  /**
   * Atiende la visita a un link corto: responde la redirección y, sin
   * esperar, guarda el clic. `domain` vacío = dominio de la plataforma.
   */
  async handle(
    domain: string,
    code: string,
    req: Request,
    res: Response,
  ): Promise<void> {
    let link: ShortLink | null = null;
    try {
      link = await this.linkModel
        .findOne({ domain: domain.toLowerCase(), code })
        .exec();
    } catch (err) {
      this.logger.error(`Fallo al resolver ${domain}/${code}: ${String(err)}`);
    }

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');

    const expired = !!link?.expiresAt && link.expiresAt.getTime() < Date.now();
    if (!link || link.status !== 'active' || expired) {
      res
        .status(link ? 410 : 404)
        .type('html')
        .send(
          notFoundPage(
            link
              ? 'Este enlace ya no está disponible.'
              : 'Este enlace no existe.',
          ),
        );
      return;
    }

    const cookies = parseCookies(req.headers.cookie);
    const known = cookies[VISITOR_COOKIE];
    const visitorId =
      known && /^[a-f0-9]{24}$/.test(known)
        ? known
        : randomBytes(12).toString('hex');
    if (visitorId !== known)
      res.setHeader(
        'Set-Cookie',
        `${VISITOR_COOKIE}=${visitorId}; Max-Age=${VISITOR_MAX_AGE}; Path=/; HttpOnly; SameSite=Lax; Secure`,
      );

    const query: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.query ?? {}).slice(0, 30)) {
      if (typeof v === 'string')
        query[k.replace(/[.$]/g, '_').slice(0, 60)] = v.slice(0, 300);
    }

    // 302 y no 301: un 301 lo cachea el navegador y los clics siguientes no llegan.
    res.redirect(302, buildDestination(link, query));

    // A partir de aquí la respuesta ya salió: nada de esto puede afectarla.
    // HEAD lo usan los comprobadores de enlaces, no las personas.
    void this.record(
      link,
      req,
      visitorId,
      cookies,
      query,
      req.method === 'HEAD',
    ).catch((err) =>
      this.logger.error(`No se pudo registrar el clic: ${String(err)}`),
    );
  }

  private async record(
    link: ShortLink,
    req: Request,
    visitorId: string,
    cookies: Record<string, string>,
    query: Record<string, string>,
    forceBot: boolean,
  ): Promise<void> {
    const ua = parseUserAgent(req.headers['user-agent']);
    const isBot = ua.isBot || forceBot;
    const ip = clientIp(
      {
        forwardedFor: req.headers['x-forwarded-for'],
        cfConnectingIp: req.headers['cf-connecting-ip'],
      },
      req.socket?.remoteAddress,
    );
    // Un bucle contra un link no debe inflar las métricas ni llenar la base:
    // se sigue redirigiendo, pero a partir del tope ya no se registra.
    if (this.overLimit(`${ip}|${String(link._id)}`)) return;
    const referer = (req.headers.referer ?? '').slice(0, 500);
    let refererHost = '';
    try {
      refererHost = referer ? new URL(referer).hostname : '';
    } catch {
      refererHost = '';
    }
    // La cookie de visitante es nuestra: no aporta nada guardarla dos veces.
    const { [VISITOR_COOKIE]: _own, ...otherCookies } = cookies;
    void _own;

    const isUnique =
      !isBot &&
      !(await this.clickModel.exists({
        linkId: link._id,
        visitorId,
        isBot: false,
      }));

    const headerCountry = req.headers['cf-ipcountry'];
    const geo: Geo =
      typeof headerCountry === 'string' && headerCountry.length === 2
        ? { country: headerCountry.toUpperCase() }
        : await this.lookupGeo(ip);

    await this.clickModel.create({
      tenantId: link.tenantId,
      linkId: link._id,
      at: new Date(),
      ip,
      userAgent: (req.headers['user-agent'] ?? '').slice(0, 600),
      browser: ua.browser,
      browserVersion: ua.browserVersion,
      os: ua.os,
      device: isBot ? 'bot' : ua.device,
      isBot,
      isUnique,
      visitorId,
      language: (req.headers['accept-language'] ?? '')
        .split(',')[0]
        ?.trim()
        .slice(0, 20),
      referer: referer || undefined,
      refererHost: refererHost || undefined,
      query: Object.keys(query).length ? query : undefined,
      cookies: Object.keys(otherCookies).length ? otherCookies : undefined,
      country: geo.country,
      city: geo.city,
      customerId: link.customerId,
      campaignId: link.campaignId,
      batchId: link.batchId,
    });

    await this.linkModel
      .updateOne(
        { _id: link._id },
        isBot
          ? { $inc: { botClicks: 1 } }
          : {
              $inc: { clicks: 1, uniqueClicks: isUnique ? 1 : 0 },
              $set: { lastClickAt: new Date() },
            },
      )
      .exec();
  }

  /** True si esta IP ya superó el tope de clics registrables por minuto. */
  private overLimit(key: string): boolean {
    const window = Math.floor(Date.now() / 60_000);
    if (window !== this.hitsWindow || this.hits.size > 50_000) {
      this.hits.clear();
      this.hitsWindow = window;
    }
    const count = (this.hits.get(key) ?? 0) + 1;
    this.hits.set(key, count);
    return count > MAX_CLICKS_PER_MINUTE;
  }

  /**
   * País y ciudad por IP, solo si se configuró `GEOIP_URL` (p. ej.
   * `https://ipwho.is/{ip}`): es mandar la IP del visitante a un tercero, así
   * que por defecto no se hace.
   */
  private async lookupGeo(ip: string): Promise<Geo> {
    if (!this.geoUrl || !ip || isPrivateAddress(ip)) return {};
    const cached = this.geoCache.get(ip);
    if (cached) return cached;
    let geo: Geo = {};
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(
        this.geoUrl.replace('{ip}', encodeURIComponent(ip)),
        {
          signal: controller.signal,
        },
      );
      clearTimeout(timer);
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        const country =
          data['country_code'] ?? data['countryCode'] ?? data['country'];
        const city = data['city'];
        geo = {
          country:
            typeof country === 'string' ? country.slice(0, 60) : undefined,
          city: typeof city === 'string' ? city.slice(0, 80) : undefined,
        };
      }
    } catch {
      geo = {};
    }
    if (this.geoCache.size >= GEO_CACHE_MAX) this.geoCache.clear();
    this.geoCache.set(ip, geo);
    return geo;
  }
}

/** Destino final: la URL guardada + UTM + los parámetros con que se abrió. */
export function buildDestination(
  link: Pick<ShortLink, 'destination' | 'utm'>,
  query: Record<string, string>,
): string {
  let url: URL;
  try {
    url = new URL(link.destination);
  } catch {
    return link.destination;
  }
  for (const [key, value] of Object.entries(link.utm ?? {})) {
    if (value && !url.searchParams.has(`utm_${key}`))
      url.searchParams.set(`utm_${key}`, String(value));
  }
  for (const [key, value] of Object.entries(query)) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return url.toString();
}

function notFoundPage(message: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Enlace no disponible</title></head><body style="margin:0;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;background:#f8fafc;color:#0f172a;"><main style="text-align:center;padding:24px;"><h1 style="font-size:20px;margin:0 0 8px;">${message}</h1><p style="margin:0;color:#64748b;">Comprueba que la dirección esté completa.</p></main></body></html>`;
}
