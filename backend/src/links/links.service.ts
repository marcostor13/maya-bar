import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { randomInt } from 'node:crypto';
import { resolve4 } from 'node:dns/promises';
import {
  LinkBatch,
  LinkChannel,
  LinkClick,
  LinkRecipient,
  LinkUtm,
  ShortDomain,
  ShortLink,
} from './link.schemas';
import { CreateBatchDto, CreateLinkDto, UpdateLinkDto } from './dto/link.dto';
import { LinkTrackingService } from './link-tracking.service';
import { ProxyDomainsService } from './proxy-domains.service';
import { Customer } from '../customers/customer.schema';
import { ListsService } from '../lists/lists.service';
import { Tenant } from '../tenants/tenant.schema';
import { fillTokensMultiline } from '../shared/contact-tokens';

const ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const CODE_LENGTH = 7;
/** Ruta que responde el propio backend para saber si un dominio ya llega aquí. */
export const PING_PATH = '/__maya-ping';
export const PING_BODY = 'maya-links-ok';
/** Si el alta en el proxy no cuaja en este tiempo, se vuelve a pedir. */
const ACTIVATION_RETRY_MS = 15 * 60 * 1000;
/** Palabras que no pueden ser alias porque son rutas del propio dominio. */
const RESERVED = new Set(['l', 'u', 'api', 'healthz', '__maya-ping']);

export function randomCode(length = CODE_LENGTH): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Solo http(s): un `javascript:` o `data:` convertiría el link en un vector de ataque. */
export function normalizeDestination(raw: string): string {
  let value = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException('La URL de destino no es válida');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new BadRequestException(
      'El destino debe ser una dirección http o https',
    );
  return url.toString();
}

export type ShortLinkView = Record<string, unknown> & { shortUrl: string };

export interface PersonalLinkTarget {
  customerId?: Types.ObjectId;
  recipient?: LinkRecipient;
}

export interface LinkStats {
  totals: {
    clicks: number;
    unique: number;
    bots: number;
    lastClickAt: Date | null;
  };
  series: { date: string; clicks: number; unique: number }[];
  devices: { label: string; value: number }[];
  browsers: { label: string; value: number }[];
  os: { label: string; value: number }[];
  countries: { label: string; value: number }[];
  referers: { label: string; value: number }[];
  languages: { label: string; value: number }[];
  /** `hours[díaSemana 0=lunes][hora]`. */
  hours: number[][];
  topLinks: {
    _id: string;
    title: string;
    shortUrl: string;
    clicks: number;
    unique: number;
  }[];
  recent: Record<string, unknown>[];
}

interface StatsFilter {
  linkId?: string;
  batchId?: string;
  campaignId?: string;
  from?: string;
  to?: string;
  timezone?: string;
}

@Injectable()
export class LinksService {
  private readonly logger = new Logger(LinksService.name);
  private readonly apiBase: string;
  private readonly serverIp: string;
  private readonly frontendHost: string;

  constructor(
    @InjectModel(ShortLink.name) private linkModel: Model<ShortLink>,
    @InjectModel(LinkClick.name) private clickModel: Model<LinkClick>,
    @InjectModel(ShortDomain.name) private domainModel: Model<ShortDomain>,
    @InjectModel(LinkBatch.name) private batchModel: Model<LinkBatch>,
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
    @InjectModel(Tenant.name) private tenantModel: Model<Tenant>,
    private lists: ListsService,
    private tracking: LinkTrackingService,
    private proxy: ProxyDomainsService,
    config: ConfigService,
  ) {
    this.apiBase = (config.get<string>('PUBLIC_API_URL') ?? '').replace(
      /\/+$/,
      '',
    );
    this.serverIp = config.get<string>('SERVER_IP') ?? '';
    try {
      this.frontendHost = new URL(
        config.get<string>('FRONTEND_URL') ?? '',
      ).hostname.toLowerCase();
    } catch {
      this.frontendHost = '';
    }
  }

  /** URL pública de un link, según use dominio propio o el de la plataforma. */
  shortUrl(link: Pick<ShortLink, 'domain' | 'code'>): string {
    return link.domain
      ? `https://${link.domain}/${link.code}`
      : `${this.apiBase}/l/${link.code}`;
  }

  // ------------------------------------------------------------------
  // Links
  // ------------------------------------------------------------------

  async findAll(
    tenantId: string,
    opts: { search?: string; batchId?: string; scope?: string } = {},
  ) {
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
    };
    if (opts.batchId && Types.ObjectId.isValid(opts.batchId)) {
      filter['batchId'] = new Types.ObjectId(opts.batchId);
    } else if (opts.scope !== 'all') {
      // El listado principal es de links "sueltos": los personales de un lote
      // o de una campaña son miles y se ven dentro de su lote.
      filter['batchId'] = null;
      filter['campaignId'] = null;
    }
    if (opts.search?.trim()) {
      const rx = new RegExp(
        opts.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      filter['$or'] = [{ title: rx }, { code: rx }, { destination: rx }];
    }
    const links = await this.linkModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean()
      .exec();
    return links.map((l) => ({ ...l, shortUrl: this.shortUrl(l) }));
  }

  /** El link como objeto plano, con su URL corta ya armada. */
  private present(link: ShortLink): ShortLinkView {
    return {
      ...(link.toObject() as Record<string, unknown>),
      shortUrl: this.shortUrl(link),
    };
  }

  async findOne(id: string, tenantId: string): Promise<ShortLink> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('Identificador inválido');
    const link = await this.linkModel
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .exec();
    if (!link) throw new NotFoundException('Link no encontrado');
    return link;
  }

  async getOne(id: string, tenantId: string) {
    const link = await this.findOne(id, tenantId);
    return this.present(link);
  }

  async create(tenantId: string, userId: string, dto: CreateLinkDto) {
    const domain = await this.resolveDomain(tenantId, dto.domain);
    const destination = normalizeDestination(dto.destination);
    const base = {
      tenantId: new Types.ObjectId(tenantId),
      domain,
      title: dto.title?.trim() ?? '',
      destination,
      utm: cleanUtm(dto.utm),
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      createdBy: new Types.ObjectId(userId),
    };

    if (dto.alias) {
      if (RESERVED.has(dto.alias.toLowerCase()))
        throw new BadRequestException('Ese alias está reservado');
      try {
        const link = await this.linkModel.create({ ...base, code: dto.alias });
        return this.present(link);
      } catch (err) {
        if ((err as { code?: number }).code === 11000)
          throw new ConflictException(
            'Ese alias ya está en uso en este dominio',
          );
        throw err;
      }
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const link = await this.linkModel.create({
          ...base,
          code: randomCode(),
        });
        return this.present(link);
      } catch (err) {
        if ((err as { code?: number }).code !== 11000) throw err;
      }
    }
    throw new ConflictException(
      'No se pudo generar un código libre. Inténtalo de nuevo.',
    );
  }

  async update(id: string, tenantId: string, dto: UpdateLinkDto) {
    const link = await this.findOne(id, tenantId);
    if (dto.destination !== undefined)
      link.destination = normalizeDestination(dto.destination);
    if (dto.title !== undefined) link.title = dto.title.trim();
    if (dto.status !== undefined) link.status = dto.status;
    if (dto.utm !== undefined) {
      link.utm = cleanUtm(dto.utm);
      link.markModified('utm');
    }
    if (dto.expiresAt !== undefined)
      link.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
    await link.save();
    return this.present(link);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const link = await this.findOne(id, tenantId);
    await this.clickModel.deleteMany({ linkId: link._id }).exec();
    await this.linkModel.deleteOne({ _id: link._id }).exec();
  }

  /**
   * Crea de una vez un link personal por destinatario y devuelve la URL de
   * cada uno, en el mismo orden. Lo usan los lotes y las campañas.
   */
  async createPersonalLinks(
    tenantId: string,
    opts: {
      destination: string;
      domain?: string;
      utm?: LinkUtm;
      channel?: LinkChannel;
      campaignId?: Types.ObjectId;
      batchId?: Types.ObjectId;
      title?: string;
      userId?: string;
    },
    targets: PersonalLinkTarget[],
  ): Promise<{ linkId: Types.ObjectId; shortUrl: string }[]> {
    if (!targets.length) return [];
    const domain = await this.resolveDomain(tenantId, opts.domain);
    const destination = normalizeDestination(opts.destination);
    const tid = new Types.ObjectId(tenantId);

    const used = new Set<string>();
    const docs = targets.map((t) => {
      let code = randomCode();
      while (used.has(code)) code = randomCode();
      used.add(code);
      return {
        _id: new Types.ObjectId(),
        tenantId: tid,
        domain,
        code,
        title: opts.title ?? '',
        destination,
        utm: cleanUtm(opts.utm),
        channel: opts.channel,
        campaignId: opts.campaignId,
        batchId: opts.batchId,
        customerId: t.customerId,
        recipient: t.recipient,
        createdBy: opts.userId ? new Types.ObjectId(opts.userId) : undefined,
      };
    });

    // Una colisión de código es rarísima (62^7), pero con `ordered: false` el
    // resto se inserta igual y solo se reintentan los que chocaron.
    let pending = docs;
    for (let attempt = 0; attempt < 4 && pending.length; attempt++) {
      try {
        await this.linkModel.insertMany(pending, { ordered: false });
        pending = [];
      } catch (err) {
        const failed = new Set(
          (
            (err as { writeErrors?: { index: number }[] }).writeErrors ?? []
          ).map((w) => w.index),
        );
        if (!failed.size) throw err;
        pending = pending.filter((_, i) => failed.has(i));
        for (const d of pending) d.code = randomCode();
      }
    }
    if (pending.length)
      throw new ConflictException('No se pudieron generar todos los links');

    return docs.map((d) => ({ linkId: d._id, shortUrl: this.shortUrl(d) }));
  }

  // ------------------------------------------------------------------
  // Dominios
  // ------------------------------------------------------------------

  async domains(tenantId: string) {
    const rows = await this.domainModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    return {
      /** A dónde debe apuntar el registro A del dominio. */
      serverIp: await this.expectedIp(),
      platformBase: `${this.apiBase}/l/`,
      /** Si basta con crear el registro A (el alta en el proxy es automática). */
      selfService: this.proxy.enabled,
      domains: rows,
    };
  }

  async addDomain(tenantId: string, userId: string, raw: string) {
    const domain = raw.trim().toLowerCase();
    const apiHost = this.apiHost();
    // Sin saber cuál es el dominio de la API no se puede garantizar que no
    // se registre ese mismo: todas sus rutas pasarían a resolverse como links.
    if (!apiHost)
      throw new BadRequestException(
        'El servidor no tiene configurado PUBLIC_API_URL: no se pueden registrar dominios',
      );
    const reserved = [apiHost, this.frontendHost].filter(Boolean);
    if (
      reserved.some(
        (h) =>
          domain === h ||
          domain === `www.${h}` ||
          domain.endsWith(`.${apiHost}`),
      )
    )
      throw new BadRequestException('Ese dominio ya es el de la plataforma');
    const taken = await this.domainModel.findOne({ domain }).lean().exec();
    if (taken)
      throw new ConflictException(
        String(taken.tenantId) === tenantId
          ? 'Ese dominio ya está registrado'
          : 'Ese dominio ya está registrado en otra cuenta',
      );
    const first = !(await this.domainModel.exists({
      tenantId: new Types.ObjectId(tenantId),
    }));
    const created = await this.domainModel.create({
      tenantId: new Types.ObjectId(tenantId),
      domain,
      isDefault: first,
      createdBy: new Types.ObjectId(userId),
    });
    await this.tracking.refreshDomains();
    return this.verifyDomain(String(created._id), tenantId);
  }

  /**
   * Comprueba el dominio en dos pasos: que el DNS apunte al servidor y que el
   * servidor ya lo sirva por https (el proxy necesita conocerlo para emitir
   * el certificado; eso se hace al aprovisionar, no desde aquí).
   */
  async verifyDomain(
    id: string,
    tenantId: string,
  ): Promise<Record<string, unknown>> {
    const domain = await this.findDomain(id, tenantId);
    const expected = await this.expectedIp();
    let addresses: string[] = [];
    try {
      addresses = await resolve4(domain.domain);
    } catch {
      addresses = [];
    }
    domain.resolvedTo = addresses;
    domain.checkedAt = new Date();

    if (!addresses.length) {
      domain.status = 'pending';
      domain.checkMessage = `El dominio aún no resuelve. Crea un registro A hacia ${expected || 'la IP del servidor'}.`;
    } else if (expected && !addresses.includes(expected)) {
      domain.status = 'pending';
      domain.checkMessage = `El dominio apunta a ${addresses.join(', ')} y debe apuntar a ${expected}. Si usas Cloudflare, deja el registro sin proxy (nube gris).`;
    } else if (await this.pings(domain.domain)) {
      domain.status = 'active';
      domain.checkMessage = 'Dominio activo.';
    } else {
      await this.activate(domain);
    }
    await domain.save();
    return domain.toObject() as Record<string, unknown>;
  }

  /**
   * El DNS ya apunta aquí pero el dominio aún no responde: se pide al proxy
   * que lo sirva. Solo llega a este punto un dominio cuyo registro A apunta a
   * este servidor, que es la prueba de que quien lo registra lo controla.
   */
  private async activate(domain: ShortDomain): Promise<void> {
    if (!this.proxy.enabled) {
      domain.status = 'dns_ok';
      domain.checkMessage =
        'El DNS es correcto, pero el servidor todavía no sirve este dominio. Hay que añadirlo a SHORT_LINK_DOMAINS y ejecutar el aprovisionamiento para emitir el certificado.';
      return;
    }
    const requested = domain.activationRequestedAt?.getTime() ?? 0;
    const waiting = Date.now() - requested < ACTIVATION_RETRY_MS;
    if (domain.status === 'activating' && waiting) {
      domain.checkMessage =
        'DNS correcto. Estamos activando el dominio y emitiendo su certificado: suele tardar unos minutos.';
      return;
    }
    try {
      await this.proxy.ensure(domain.domain);
      domain.status = 'activating';
      domain.activationRequestedAt = new Date();
      domain.checkMessage =
        'DNS correcto. Estamos activando el dominio y emitiendo su certificado: suele tardar unos minutos.';
    } catch (err) {
      this.logger.error(
        `No se pudo dar de alta ${domain.domain} en el proxy: ${err instanceof Error ? err.message : String(err)}`,
      );
      domain.status = 'dns_ok';
      domain.checkMessage =
        'El DNS es correcto, pero no se pudo activar el dominio automáticamente. Vuelve a verificar en unos minutos.';
    }
  }

  async setDefaultDomain(id: string, tenantId: string) {
    const domain = await this.findDomain(id, tenantId);
    await this.domainModel
      .updateMany({ tenantId: domain.tenantId }, { $set: { isDefault: false } })
      .exec();
    domain.isDefault = true;
    await domain.save();
    return domain.toObject() as Record<string, unknown>;
  }

  async removeDomain(id: string, tenantId: string): Promise<void> {
    const domain = await this.findDomain(id, tenantId);
    const inUse = await this.linkModel.countDocuments({
      tenantId: domain.tenantId,
      domain: domain.domain,
    });
    if (inUse)
      throw new BadRequestException(
        `Hay ${inUse} link(s) con este dominio. Elimínalos antes: dejarían de funcionar.`,
      );
    await this.domainModel.deleteOne({ _id: domain._id }).exec();
    await this.tracking.refreshDomains();
    if (this.proxy.enabled)
      // Que falle la limpieza en el proxy no impide borrar el dominio aquí.
      await this.proxy
        .remove(domain.domain)
        .catch((err) =>
          this.logger.warn(
            `No se pudo quitar ${domain.domain} del proxy: ${String(err)}`,
          ),
        );
  }

  private async findDomain(id: string, tenantId: string): Promise<ShortDomain> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('Identificador inválido');
    const domain = await this.domainModel
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .exec();
    if (!domain) throw new NotFoundException('Dominio no encontrado');
    return domain;
  }

  /**
   * Dominio con el que crear un link: el pedido (si es de la empresa y está
   * activo), el predeterminado, o vacío para usar el de la plataforma.
   */
  async resolveDomain(tenantId: string, requested?: string): Promise<string> {
    const tid = new Types.ObjectId(tenantId);
    if (requested === '') return '';
    if (requested) {
      const found = await this.domainModel
        .findOne({ tenantId: tid, domain: requested.trim().toLowerCase() })
        .lean()
        .exec();
      if (!found)
        throw new BadRequestException('Ese dominio no está registrado');
      if (found.status !== 'active')
        throw new BadRequestException(
          'Ese dominio todavía no está activo. Verifícalo antes de usarlo.',
        );
      return found.domain;
    }
    const fallback = await this.domainModel
      .findOne({ tenantId: tid, isDefault: true, status: 'active' })
      .lean()
      .exec();
    return fallback?.domain ?? '';
  }

  private apiHost(): string {
    try {
      return new URL(this.apiBase).hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  private async expectedIp(): Promise<string> {
    if (this.serverIp) return this.serverIp;
    const host = this.apiHost();
    if (!host) return '';
    try {
      return (await resolve4(host))[0] ?? '';
    } catch {
      return '';
    }
  }

  private async pings(domain: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`https://${domain}${PING_PATH}`, {
        signal: controller.signal,
        redirect: 'error',
      });
      clearTimeout(timer);
      return res.ok && (await res.text()).trim() === PING_BODY;
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------------
  // Lotes (links masivos)
  // ------------------------------------------------------------------

  batches(tenantId: string): Promise<LinkBatch[]> {
    return this.batchModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .limit(200)
      .exec();
  }

  async createBatch(tenantId: string, userId: string, dto: CreateBatchDto) {
    const tid = new Types.ObjectId(tenantId);
    const targets: PersonalLinkTarget[] = [];
    let source: LinkBatch['source'] = 'contacts';

    if (dto.rows?.length) {
      source = 'file';
      const seen = new Set<string>();
      for (const row of dto.rows) {
        const recipient: LinkRecipient & { fields?: Record<string, string> } = {
          name: row.name?.trim() || undefined,
          phone: row.phone?.trim() || undefined,
          email: row.email?.trim().toLowerCase() || undefined,
        };
        if (!recipient.name && !recipient.phone && !recipient.email) continue;
        const key = `${recipient.phone ?? ''}|${recipient.email ?? ''}|${recipient.name ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (row.fields && Object.keys(row.fields).length)
          recipient.fields = Object.fromEntries(
            Object.entries(row.fields)
              .slice(0, 40)
              .map(([k, v]) => [
                k.replace(/[.$]/g, '_').slice(0, 60),
                String(v).slice(0, 300),
              ]),
          );
        targets.push({ recipient });
      }
    } else {
      let customers: { _id: unknown }[] = [];
      if (dto.listIds?.length) {
        source = 'lists';
        customers = await this.lists.resolveCustomers(dto.listIds, tenantId);
      } else if (dto.customerIds?.length) {
        customers = await this.customerModel
          .find(
            {
              tenantId: tid,
              _id: { $in: dto.customerIds.map((c) => new Types.ObjectId(c)) },
            },
            { _id: 1 },
          )
          .lean()
          .exec();
      }
      const seen = new Set<string>();
      for (const c of customers) {
        const id = String(c._id);
        if (seen.has(id)) continue;
        seen.add(id);
        targets.push({ customerId: new Types.ObjectId(id) });
      }
    }

    if (!targets.length)
      throw new BadRequestException(
        'No hay destinatarios: elige una lista, contactos o sube un archivo con datos.',
      );
    if (targets.length > 10_000)
      throw new BadRequestException('Un lote admite como máximo 10 000 links');

    const destination = normalizeDestination(dto.destination);
    const domain = await this.resolveDomain(tenantId, dto.domain);
    const batch = await this.batchModel.create({
      tenantId: tid,
      name: dto.name.trim(),
      destination,
      domain,
      channel: dto.channel as LinkChannel,
      message: dto.message ?? '',
      subject: dto.subject?.trim() || undefined,
      source,
      count: targets.length,
      createdBy: new Types.ObjectId(userId),
    });
    try {
      await this.createPersonalLinks(
        tenantId,
        {
          destination,
          domain,
          utm: dto.utm,
          channel: dto.channel as LinkChannel,
          batchId: batch._id,
          title: batch.name,
          userId,
        },
        targets,
      );
    } catch (err) {
      // Un lote sin links no sirve de nada: mejor que no quede a medias.
      await this.linkModel.deleteMany({ batchId: batch._id }).exec();
      await this.batchModel.deleteOne({ _id: batch._id }).exec();
      throw err;
    }
    return batch;
  }

  /** Filas del lote con el link y el mensaje ya armado para cada destinatario. */
  async batchRows(id: string, tenantId: string) {
    const batch = await this.findBatch(id, tenantId);
    const links = await this.linkModel
      .find({ tenantId: batch.tenantId, batchId: batch._id })
      .sort({ _id: 1 })
      .populate('customerId', 'name email phone customFields')
      .lean()
      .exec();
    const tenant = await this.tenantModel
      .findById(batch.tenantId, { name: 1 })
      .lean()
      .exec();

    const rows = links.map((l) => {
      const customer = l.customerId as unknown as {
        _id: Types.ObjectId;
        name?: string;
        email?: string;
        phone?: string;
        customFields?: Record<string, unknown>;
      } | null;
      const recipient = (l.recipient ?? {}) as LinkRecipient & {
        fields?: Record<string, string>;
      };
      const person = customer
        ? {
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            customFields: customer.customFields,
          }
        : {
            name: recipient.name,
            email: recipient.email,
            phone: recipient.phone,
            customFields: recipient.fields,
          };
      const shortUrl = this.shortUrl(l);
      const ctx = { empresa: tenant?.name ?? '', link: shortUrl };
      return {
        _id: String(l._id),
        customerId: customer ? String(customer._id) : undefined,
        name: person.name ?? '',
        phone: person.phone ?? '',
        email: person.email ?? '',
        shortUrl,
        clicks: l.clicks,
        uniqueClicks: l.uniqueClicks,
        lastClickAt: l.lastClickAt,
        subject: batch.subject
          ? fillTokensMultiline(batch.subject, person, ctx)
          : undefined,
        message: batch.message
          ? fillTokensMultiline(batch.message, person, ctx)
          : '',
      };
    });
    return { batch, rows };
  }

  async removeBatch(id: string, tenantId: string): Promise<void> {
    const batch = await this.findBatch(id, tenantId);
    const linkIds = await this.linkModel
      .find({ batchId: batch._id }, { _id: 1 })
      .lean()
      .exec();
    await this.clickModel
      .deleteMany({ linkId: { $in: linkIds.map((l) => l._id) } })
      .exec();
    await this.linkModel.deleteMany({ batchId: batch._id }).exec();
    await this.batchModel.deleteOne({ _id: batch._id }).exec();
  }

  private async findBatch(id: string, tenantId: string): Promise<LinkBatch> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('Identificador inválido');
    const batch = await this.batchModel
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .exec();
    if (!batch) throw new NotFoundException('Lote no encontrado');
    return batch;
  }

  // ------------------------------------------------------------------
  // Analítica
  // ------------------------------------------------------------------

  async stats(tenantId: string, f: StatsFilter): Promise<LinkStats> {
    const tid = new Types.ObjectId(tenantId);
    const match: Record<string, unknown> = { tenantId: tid };
    for (const key of ['linkId', 'batchId', 'campaignId'] as const) {
      const value = f[key];
      if (!value) continue;
      if (!Types.ObjectId.isValid(value))
        throw new BadRequestException('Identificador inválido');
      match[key] = new Types.ObjectId(value);
    }
    const to = f.to ? new Date(f.to) : new Date();
    const from = f.from
      ? new Date(f.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()))
      throw new BadRequestException('Rango de fechas inválido');
    match['at'] = { $gte: from, $lte: to };
    const timezone = /^[A-Za-z_]+\/[A-Za-z_/]+$/.test(f.timezone ?? '')
      ? f.timezone!
      : 'America/Lima';

    const top = (
      field: string,
      limit = 8,
    ): PipelineStage.FacetPipelineStage[] => [
      { $match: { isBot: false } },
      {
        $group: {
          _id: { $ifNull: [`$${field}`, 'Desconocido'] },
          value: { $sum: 1 },
        },
      },
      { $sort: { value: -1 } },
      { $limit: limit },
      { $project: { _id: 0, label: '$_id', value: 1 } },
    ];

    const [agg] = await this.clickModel
      .aggregate<{
        totals: {
          clicks: number;
          unique: number;
          bots: number;
          lastClickAt: Date | null;
        }[];
        series: { _id: string; clicks: number; unique: number }[];
        devices: { label: string; value: number }[];
        browsers: { label: string; value: number }[];
        os: { label: string; value: number }[];
        countries: { label: string; value: number }[];
        referers: { label: string; value: number }[];
        languages: { label: string; value: number }[];
        hours: { _id: { d: number; h: number }; value: number }[];
        topLinks: { _id: Types.ObjectId; clicks: number; unique: number }[];
        recent: Record<string, unknown>[];
      }>([
        { $match: match },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  clicks: { $sum: { $cond: ['$isBot', 0, 1] } },
                  unique: { $sum: { $cond: ['$isUnique', 1, 0] } },
                  bots: { $sum: { $cond: ['$isBot', 1, 0] } },
                  lastClickAt: { $max: { $cond: ['$isBot', null, '$at'] } },
                },
              },
            ],
            series: [
              { $match: { isBot: false } },
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: '%Y-%m-%d',
                      date: '$at',
                      timezone,
                    },
                  },
                  clicks: { $sum: 1 },
                  unique: { $sum: { $cond: ['$isUnique', 1, 0] } },
                },
              },
              { $sort: { _id: 1 } },
            ],
            devices: top('device'),
            browsers: top('browser'),
            os: top('os'),
            countries: top('country', 10),
            referers: [
              { $match: { isBot: false } },
              {
                $group: {
                  _id: { $ifNull: ['$refererHost', 'Directo / app'] },
                  value: { $sum: 1 },
                },
              },
              { $sort: { value: -1 } },
              { $limit: 8 },
              { $project: { _id: 0, label: '$_id', value: 1 } },
            ],
            languages: top('language', 6),
            hours: [
              { $match: { isBot: false } },
              {
                $group: {
                  _id: {
                    d: { $isoDayOfWeek: { date: '$at', timezone } },
                    h: { $hour: { date: '$at', timezone } },
                  },
                  value: { $sum: 1 },
                },
              },
            ],
            topLinks: [
              { $match: { isBot: false } },
              {
                $group: {
                  _id: '$linkId',
                  clicks: { $sum: 1 },
                  unique: { $sum: { $cond: ['$isUnique', 1, 0] } },
                },
              },
              { $sort: { clicks: -1 } },
              { $limit: 10 },
            ],
            recent: [
              { $sort: { at: -1 } },
              { $limit: 100 },
              {
                $lookup: {
                  from: 'customers',
                  localField: 'customerId',
                  foreignField: '_id',
                  as: 'customer',
                  pipeline: [{ $project: { name: 1 } }],
                },
              },
              {
                $project: {
                  at: 1,
                  ip: 1,
                  browser: 1,
                  browserVersion: 1,
                  os: 1,
                  device: 1,
                  isBot: 1,
                  isUnique: 1,
                  language: 1,
                  refererHost: 1,
                  country: 1,
                  city: 1,
                  query: 1,
                  cookies: 1,
                  visitorId: 1,
                  userAgent: 1,
                  linkId: 1,
                  customerName: { $first: '$customer.name' },
                },
              },
            ],
          },
        },
      ])
      .exec();

    const hours = Array.from({ length: 7 }, () =>
      new Array<number>(24).fill(0),
    );
    for (const h of agg?.hours ?? []) {
      // isoDayOfWeek: 1 = lunes … 7 = domingo.
      if (h._id.d >= 1 && h._id.d <= 7) hours[h._id.d - 1][h._id.h] = h.value;
    }

    const topIds = (agg?.topLinks ?? []).map((t) => t._id);
    const topDocs = topIds.length
      ? await this.linkModel
          .find(
            { _id: { $in: topIds }, tenantId: tid },
            { title: 1, code: 1, domain: 1, destination: 1 },
          )
          .lean()
          .exec()
      : [];
    const byId = new Map(topDocs.map((l) => [String(l._id), l]));

    return {
      totals: agg?.totals[0] ?? {
        clicks: 0,
        unique: 0,
        bots: 0,
        lastClickAt: null,
      },
      series: fillDays(from, to, timezone, agg?.series ?? []),
      devices: agg?.devices ?? [],
      browsers: agg?.browsers ?? [],
      os: agg?.os ?? [],
      countries: (agg?.countries ?? []).filter(
        (c) => c.label !== 'Desconocido',
      ),
      referers: agg?.referers ?? [],
      languages: agg?.languages ?? [],
      hours,
      topLinks: (agg?.topLinks ?? [])
        .map((t) => {
          const link = byId.get(String(t._id));
          return link
            ? {
                _id: String(t._id),
                title: link.title || link.destination,
                shortUrl: this.shortUrl(link),
                clicks: t.clicks,
                unique: t.unique,
              }
            : null;
        })
        .filter((t): t is NonNullable<typeof t> => t !== null),
      recent: agg?.recent ?? [],
    };
  }

  /** Todos los clics de un link (o lote) como filas para CSV. */
  async clicksForExport(
    tenantId: string,
    f: { linkId?: string; batchId?: string },
  ) {
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
    };
    if (f.linkId && Types.ObjectId.isValid(f.linkId))
      filter['linkId'] = new Types.ObjectId(f.linkId);
    else if (f.batchId && Types.ObjectId.isValid(f.batchId))
      filter['batchId'] = new Types.ObjectId(f.batchId);
    else throw new BadRequestException('Indica un link o un lote');
    return this.clickModel
      .find(filter)
      .sort({ at: -1 })
      .limit(50_000)
      .populate('customerId', 'name email phone')
      .lean()
      .exec();
  }
}

function cleanUtm(utm?: LinkUtm): LinkUtm {
  const out: LinkUtm = {};
  for (const key of [
    'source',
    'medium',
    'campaign',
    'term',
    'content',
  ] as const) {
    const value = utm?.[key]?.trim();
    if (value) out[key] = value;
  }
  return out;
}

/** Rellena los días sin clics para que la serie no tenga huecos. */
function fillDays(
  from: Date,
  to: Date,
  timezone: string,
  rows: { _id: string; clicks: number; unique: number }[],
): { date: string; clicks: number; unique: number }[] {
  const byDay = new Map(rows.map((r) => [r._id, r]));
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
  const out: { date: string; clicks: number; unique: number }[] = [];
  const seen = new Set<string>();
  const dayMs = 24 * 60 * 60 * 1000;
  // Tope de 400 puntos: más no cabe en un gráfico ni aporta.
  const start = Math.max(from.getTime(), to.getTime() - 400 * dayMs);
  for (let t = start; t <= to.getTime() + dayMs; t += dayMs) {
    const date = fmt.format(new Date(Math.min(t, to.getTime())));
    if (seen.has(date)) continue;
    seen.add(date);
    const row = byDay.get(date);
    out.push({ date, clicks: row?.clicks ?? 0, unique: row?.unique ?? 0 });
  }
  return out;
}
