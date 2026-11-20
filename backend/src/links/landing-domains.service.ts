import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { resolve4, resolveTxt } from 'node:dns/promises';
import { randomBytes } from 'node:crypto';
import { LandingDomain } from './landing-domain.schema';
import { ShortDomain } from './link.schemas';
import { Event } from '../events/event.schema';
import { ProxyDomainsService, hostOf } from './proxy-domains.service';
import { DOMAIN_RE } from './dto/link.dto';

/** No se pide el alta en Coolify más de una vez en este intervalo. */
const ACTIVATION_RETRY_MS = 10 * 60 * 1000;
const PING_TIMEOUT_MS = 6000;
/** Cada alta redespliega el frontend: tope de dominios por empresa. */
export const MAX_LANDING_DOMAINS = 10;
/** Un dominio sin verificar de otra empresa se libera pasado este tiempo. */
export const UNVERIFIED_CLAIM_TTL_MS = 72 * 60 * 60 * 1000;
export const TXT_PREFIX = '_maya-verify';
const ACTIVATING_MSG =
  'DNS correcto. Estamos activando el dominio y emitiendo su certificado: suele tardar unos minutos.';

export interface LandingDomainView {
  _id: string;
  domain: string;
  eventId: string | null;
  status: LandingDomain['status'];
  checkMessage?: string;
  checkedAt?: Date;
  resolvedTo: string[];
  /** Registro TXT que prueba que el dominio es de quien lo registra. */
  txtName: string;
  txtValue: string;
}

/**
 * Dominios propios de las landings de eventos (HU25). Reutiliza el alta en el
 * proxy de los dominios de links, pero sobre la app del frontend: es la que
 * sirve `/e/<slug>`, y la raíz de un dominio propio monta esa misma página.
 */
@Injectable()
export class LandingDomainsService {
  private readonly logger = new Logger(LandingDomainsService.name);
  private readonly serverIp: string;
  private readonly frontendHost: string;
  private readonly apiHost: string;

  constructor(
    @InjectModel(LandingDomain.name) private model: Model<LandingDomain>,
    @InjectModel(ShortDomain.name) private shortDomains: Model<ShortDomain>,
    @InjectModel(Event.name) private events: Model<Event>,
    private proxy: ProxyDomainsService,
    config: ConfigService,
  ) {
    this.serverIp = config.get<string>('SERVER_IP') ?? '';
    this.frontendHost = hostOf(config.get<string>('FRONTEND_URL') ?? '');
    this.apiHost = hostOf(config.get<string>('PUBLIC_API_URL') ?? '');
  }

  async list(tenantId: string, eventId?: string) {
    const filter: Record<string, unknown> = { tenantId: oid(tenantId) };
    if (eventId) {
      if (!Types.ObjectId.isValid(eventId))
        throw new BadRequestException('Evento inválido');
      filter.eventId = oid(eventId);
    }
    const rows = await this.model.find(filter).sort({ createdAt: 1 }).exec();
    return {
      /** Destino del CNAME para un subdominio. */
      cnameTarget: this.frontendHost,
      /** Destino del registro A para un dominio raíz. */
      serverIp: await this.expectedIp(),
      selfService: this.proxy.frontendEnabled,
      domains: rows.map(view),
    };
  }

  async add(
    tenantId: string,
    userId: string,
    raw: string,
    eventId?: string,
  ): Promise<LandingDomainView> {
    const domain = (raw ?? '').trim().toLowerCase().replace(/\.$/, '');
    if (!DOMAIN_RE.test(domain))
      throw new BadRequestException('Escribe un dominio válido, sin https://');
    const platform = [this.frontendHost, this.apiHost].filter(Boolean);
    if (
      platform.some(
        (h) =>
          domain === h || domain.endsWith(`.${h}`) || h === `www.${domain}`,
      )
    )
      throw new BadRequestException('Ese dominio ya es el de la plataforma');
    const [landing, short] = await Promise.all([
      this.model.findOne({ domain }).lean().exec(),
      this.shortDomains.findOne({ domain }).lean().exec(),
    ]);
    if (landing) {
      const mine = String(landing.tenantId) === tenantId;
      // Otra empresa lo registró y nunca probó que es suyo: pasado el plazo se
      // libera, para que nadie bloquee el dominio de otro.
      const stale =
        !mine &&
        landing.status !== 'active' &&
        Date.now() -
          new Date((landing as { createdAt?: Date }).createdAt ?? 0).getTime() >
          UNVERIFIED_CLAIM_TTL_MS;
      if (!stale)
        throw new ConflictException(
          mine
            ? 'Ese dominio ya está registrado'
            : 'Ese dominio ya está registrado en otra cuenta. Si es tuyo, escríbenos a soporte.',
        );
      await this.model.deleteOne({ _id: landing._id }).exec();
    }
    if (short)
      throw new ConflictException(
        'Ese dominio ya se usa para links cortos. Usa otro subdominio para la landing.',
      );
    if (eventId) await this.assertEvent(tenantId, eventId);
    const count = await this.model.countDocuments({ tenantId: oid(tenantId) });
    if (count >= MAX_LANDING_DOMAINS)
      throw new BadRequestException(
        `Puedes tener como máximo ${MAX_LANDING_DOMAINS} dominios propios`,
      );
    const created = await this.model.create({
      tenantId: oid(tenantId),
      domain,
      verifyToken: randomBytes(12).toString('hex'),
      ...(eventId ? { eventId: oid(eventId) } : {}),
      createdBy: oid(userId),
    });
    return this.verify(String(created._id), tenantId);
  }

  async assign(
    id: string,
    tenantId: string,
    eventId: string,
  ): Promise<LandingDomainView> {
    const domain = await this.find(id, tenantId);
    await this.assertEvent(tenantId, eventId);
    domain.eventId = oid(eventId);
    await domain.save();
    return view(domain);
  }

  /**
   * Primero el DNS (A o CNAME que acabe en la IP del servidor), luego el TXT
   * con el token de la empresa (la prueba de propiedad) y al final que
   * responda por https.
   */
  async verify(id: string, tenantId: string): Promise<LandingDomainView> {
    const domain = await this.find(id, tenantId);
    const expected = await this.expectedIp();
    let addresses: string[] = [];
    try {
      addresses = await resolve4(domain.domain);
    } catch {
      addresses = [];
    }
    domain.resolvedTo = addresses;
    domain.checkedAt = new Date();
    const how = `Crea un CNAME hacia ${this.frontendHost || 'el dominio de la plataforma'} (subdominio) o un registro A hacia ${expected || 'la IP del servidor'} (dominio raíz).`;
    if (!addresses.length) {
      domain.status = 'pending';
      domain.checkMessage = `El dominio aún no resuelve. ${how}`;
    } else if (expected && !addresses.includes(expected)) {
      domain.status = 'pending';
      domain.checkMessage = `El dominio apunta a ${addresses.join(', ')} y debe apuntar a ${expected}. ${how} Si usas Cloudflare, deja el registro sin proxy (nube gris).`;
    } else if (!(await this.ownsDomain(domain))) {
      domain.status = 'pending';
      domain.checkMessage = `El DNS apunta bien. Para probar que el dominio es tuyo crea un registro TXT con nombre ${txtName(domain.domain)} y valor ${txtValue(domain)}.`;
    } else if (await this.pings(domain.domain)) {
      domain.status = 'active';
      domain.checkMessage = 'Dominio activo.';
    } else {
      await this.activate(domain);
    }
    await domain.save();
    return view(domain);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const domain = await this.find(id, tenantId);
    await this.model.deleteOne({ _id: domain._id }).exec();
    if (!this.proxy.frontendEnabled) return;
    // Que falle la limpieza en el proxy no impide borrar el dominio aquí.
    try {
      await this.proxy.remove(
        domain.domain,
        await this.proxy.frontendAppUuid(),
      );
    } catch (err) {
      this.logger.warn(
        `No se pudo quitar ${domain.domain} del proxy: ${String(err)}`,
      );
    }
  }

  /** Para la landing pública: qué evento muestra la raíz de este dominio. */
  async resolve(rawHost: string): Promise<{ slug: string }> {
    const host = hostOf(rawHost ?? '');
    const notFound = new NotFoundException('Dominio sin evento publicado');
    if (!host) throw notFound;
    const domain = await this.model
      .findOne({ domain: host, status: 'active' })
      .lean()
      .exec();
    if (!domain?.eventId) throw notFound;
    const event = await this.events
      .findOne({
        _id: domain.eventId,
        tenantId: domain.tenantId,
        status: 'published',
      })
      .select('slug')
      .lean<{ slug?: string }>()
      .exec();
    if (!event?.slug) throw notFound;
    return { slug: event.slug };
  }

  private async activate(domain: LandingDomain): Promise<void> {
    if (!this.proxy.frontendEnabled) {
      domain.status = 'dns_ok';
      domain.checkMessage =
        'El DNS es correcto, pero el alta en el servidor no es automática: hay que añadir el dominio a la app del frontend en Coolify y redesplegarla.';
      return;
    }
    // Tope de altas (cada una redespliega el frontend), también tras un fallo.
    const requested = domain.activationRequestedAt?.getTime() ?? 0;
    if (Date.now() - requested < ACTIVATION_RETRY_MS) {
      if (domain.status !== 'activating') domain.status = 'dns_ok';
      domain.checkMessage =
        domain.status === 'activating'
          ? ACTIVATING_MSG
          : 'El DNS es correcto, pero no se pudo activar el dominio automáticamente. Vuelve a verificar en unos minutos.';
      return;
    }
    domain.activationRequestedAt = new Date();
    try {
      await this.proxy.ensure(
        domain.domain,
        await this.proxy.frontendAppUuid(),
      );
      domain.status = 'activating';
      domain.checkMessage = ACTIVATING_MSG;
    } catch (err) {
      this.logger.error(
        `No se pudo dar de alta la landing ${domain.domain} en el proxy: ${err instanceof Error ? err.message : String(err)}`,
      );
      domain.status = 'dns_ok';
      domain.checkMessage =
        'El DNS es correcto, pero no se pudo activar el dominio automáticamente. Vuelve a verificar en unos minutos.';
    }
  }

  private async ownsDomain(domain: LandingDomain): Promise<boolean> {
    try {
      const records = await resolveTxt(txtName(domain.domain));
      return records.some(
        (chunks) => chunks.join('').trim() === txtValue(domain),
      );
    } catch {
      return false;
    }
  }

  /** El servidor del frontend responde `{ status: 'ok' }` en `/healthz`. */
  private async pings(domain: string): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    try {
      const res = await fetch(`https://${domain}/healthz`, {
        signal: controller.signal,
        redirect: 'error',
      });
      if (!res.ok) return false;
      const body = (await res.json()) as { status?: string };
      return body?.status === 'ok';
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  private async expectedIp(): Promise<string> {
    if (this.serverIp) return this.serverIp;
    if (!this.frontendHost) return '';
    try {
      return (await resolve4(this.frontendHost))[0] ?? '';
    } catch {
      return '';
    }
  }

  private async assertEvent(tenantId: string, eventId: string): Promise<void> {
    if (!Types.ObjectId.isValid(eventId))
      throw new BadRequestException('Evento inválido');
    const exists = await this.events.exists({
      _id: oid(eventId),
      tenantId: oid(tenantId),
    });
    if (!exists) throw new NotFoundException('Evento no encontrado');
  }

  private async find(id: string, tenantId: string): Promise<LandingDomain> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('Identificador inválido');
    const domain = await this.model
      .findOne({ _id: oid(id), tenantId: oid(tenantId) })
      .exec();
    if (!domain) throw new NotFoundException('Dominio no encontrado');
    return domain;
  }
}

function oid(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}

function txtName(domain: string): string {
  return `${TXT_PREFIX}.${domain}`;
}

function txtValue(d: LandingDomain): string {
  return `maya-verify=${d.verifyToken}`;
}

function view(d: LandingDomain): LandingDomainView {
  return {
    _id: String(d._id),
    domain: d.domain,
    eventId: d.eventId ? String(d.eventId) : null,
    status: d.status,
    checkMessage: d.checkMessage,
    checkedAt: d.checkedAt,
    resolvedTo: d.resolvedTo ?? [],
    txtName: txtName(d.domain),
    txtValue: txtValue(d),
  };
}
