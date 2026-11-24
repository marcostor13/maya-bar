import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'crypto';
import { isIP } from 'net';
import { Model, Types } from 'mongoose';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { InstagramAccountsService } from '../instagram-accounts/instagram-accounts.service';
import { MessengerAccountsService } from '../messenger-accounts/messenger-accounts.service';
import { SmsService } from '../sms/sms.service';
import {
  ApiAccess,
  ApiChannel,
  ApiUsage,
  ChatChannel,
  DEFAULT_PER_DAY,
  DEFAULT_PER_MINUTE,
} from './api-access.schema';
import { CreateApiAccessDto, UpdateApiAccessDto } from './dto/api-access.dto';

const KEY_PREFIX = 'mk_';
const VISIBLE_PREFIX_LENGTH = 10;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Lo que se devuelve del acceso: nunca el hash. */
export interface ApiAccessView {
  _id: string;
  name: string;
  channel: ApiChannel;
  accountId: string;
  accountLabel: string;
  keyPrefix: string;
  purpose: 'website' | 'automation';
  allowedDomains: string[];
  allowedIps: string[];
  perMinuteLimit: number;
  perDayLimit: number;
  revoked: boolean;
  revokedAt?: Date;
  lastUsedAt?: Date;
  sentCount: number;
  /** URL de aviso (HU15); el secreto nunca se devuelve. */
  webhookUrl?: string;
  createdAt?: Date;
}

export interface ShareableAccount {
  channel: ApiChannel;
  id: string;
  label: string;
  detail?: string;
  active: boolean;
}

/** Cuenta tal como la devuelven los tres servicios de cuentas. */
interface AnyAccount {
  _id: unknown;
  tenantId: Types.ObjectId;
  label: string;
  active: boolean;
  phoneNumber?: string;
  username?: string;
}

/** Límite superado: lleva los segundos que hay que esperar. */
export class QuotaExceededException extends HttpException {
  constructor(
    readonly retryAfter: number,
    window: 'minuto' | 'día',
  ) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `Superaste el límite de envíos por ${window} de este acceso. Reintenta en ${retryAfter} s.`,
        retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Normaliza un dominio escrito por el usuario: sin esquema, ruta ni puerto.
 * Devuelve `undefined` si no es un host válido. Acepta `*.dominio.com`.
 */
export function normalizeDomain(raw: string): string | undefined {
  let value = raw.trim().toLowerCase();
  if (!value) return undefined;
  value = value.replace(/^[a-z]+:\/\//, '');
  value = value.split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '');
  if (value === 'localhost') return value;
  return /^(\*\.)?([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(value)
    ? value
    : undefined;
}

/** Host de la cabecera `Origin` o `Referer`, o `undefined` si no es una URL. */
export function hostOf(header: string | undefined): string | undefined {
  if (!header) return undefined;
  try {
    return new URL(header).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/** `dominio.com` admite también `www.`; `*.dominio.com` admite subdominios. */
export function domainAllowed(host: string, allowed: string[]): boolean {
  return allowed.some((entry) => {
    if (entry.startsWith('*.')) {
      const base = entry.slice(2);
      return host === base || host.endsWith(`.${base}`);
    }
    return host === entry || host === `www.${entry}`;
  });
}

/** `::ffff:1.2.3.4` es la misma IP que `1.2.3.4`. */
export function normalizeIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  const value = ip.trim().toLowerCase();
  return value.startsWith('::ffff:') && isIP(value.slice(7)) === 4
    ? value.slice(7)
    : value;
}

@Injectable()
export class ApiAccessService {
  constructor(
    @InjectModel(ApiAccess.name) private model: Model<ApiAccess>,
    @InjectModel(ApiUsage.name) private usage: Model<ApiUsage>,
    private waAccounts: WhatsAppAccountsService,
    private igAccounts: InstagramAccountsService,
    private msAccounts: MessengerAccountsService,
    private sms: SmsService,
  ) {}

  // ------------------------------------------------------------------
  // Administración
  // ------------------------------------------------------------------

  async list(tenantId: string): Promise<ApiAccessView[]> {
    const docs = await this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .exec();
    return docs.map((d) => this.toView(d));
  }

  /** Cuentas conectadas que se pueden compartir. */
  async accounts(tenantId: string): Promise<ShareableAccount[]> {
    const [wa, ig, ms, sms] = await Promise.all([
      this.waAccounts.findAll(tenantId),
      this.igAccounts.findAll(tenantId),
      this.msAccounts.findAll(tenantId),
      this.sms.findConfig(tenantId),
    ]);
    const map = (channel: ChatChannel, list: AnyAccount[]) =>
      list.map((a) => ({
        channel,
        id: String(a._id),
        label: a.label,
        detail:
          channel === 'whatsapp'
            ? a.phoneNumber
            : a.username
              ? `@${a.username}`
              : undefined,
        active: a.active,
      }));
    return [
      ...map('whatsapp', wa),
      ...map('instagram', ig),
      ...map('messenger', ms),
      ...(sms
        ? [
            {
              channel: 'sms' as const,
              id: String(sms._id),
              label: sms.name || 'Proveedor SMS',
              detail: sms.from || undefined,
              active: this.sms.isUsable(sms),
            },
          ]
        : []),
    ];
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateApiAccessDto,
  ): Promise<{ access: ApiAccessView; key: string }> {
    const account = await this.ownedAccount(
      dto.channel,
      dto.accountId,
      tenantId,
    );
    const key = this.newKey();
    const doc = await this.model.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name.trim(),
      channel: dto.channel,
      accountId: new Types.ObjectId(dto.accountId),
      accountLabel: account.label,
      keyHash: hashKey(key),
      keyPrefix: key.slice(0, VISIBLE_PREFIX_LENGTH),
      purpose: dto.purpose ?? 'website',
      allowedDomains: this.cleanDomains(
        dto.allowedDomains ?? [],
        dto.purpose === 'automation',
      ),
      allowedIps: this.cleanIps(dto.allowedIps ?? []),
      perMinuteLimit: dto.perMinuteLimit ?? DEFAULT_PER_MINUTE,
      perDayLimit: dto.perDayLimit ?? DEFAULT_PER_DAY,
      createdBy: Types.ObjectId.isValid(userId)
        ? new Types.ObjectId(userId)
        : undefined,
    });
    return { access: this.toView(doc), key };
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateApiAccessDto,
  ): Promise<ApiAccessView> {
    const doc = await this.owned(tenantId, id);
    if (dto.name !== undefined) doc.name = dto.name.trim();
    if (dto.allowedDomains !== undefined)
      doc.allowedDomains = this.cleanDomains(
        dto.allowedDomains,
        doc.purpose === 'automation',
      );
    if (dto.allowedIps !== undefined)
      doc.allowedIps = this.cleanIps(dto.allowedIps);
    if (dto.perMinuteLimit !== undefined)
      doc.perMinuteLimit = dto.perMinuteLimit;
    if (dto.perDayLimit !== undefined) doc.perDayLimit = dto.perDayLimit;
    await doc.save();
    return this.toView(doc);
  }

  /** Clave nueva; la anterior deja de funcionar en el acto. */
  async regenerate(
    tenantId: string,
    id: string,
  ): Promise<{ access: ApiAccessView; key: string }> {
    const doc = await this.owned(tenantId, id);
    if (doc.revokedAt)
      throw new ConflictException('El acceso está revocado: crea uno nuevo.');
    const key = this.newKey();
    doc.keyHash = hashKey(key);
    doc.keyPrefix = key.slice(0, VISIBLE_PREFIX_LENGTH);
    await doc.save();
    return { access: this.toView(doc), key };
  }

  async revoke(tenantId: string, id: string): Promise<ApiAccessView> {
    const doc = await this.owned(tenantId, id);
    if (!doc.revokedAt) {
      doc.revokedAt = new Date();
      await doc.save();
    }
    return this.toView(doc);
  }

  // ------------------------------------------------------------------
  // Uso desde la API pública
  // ------------------------------------------------------------------

  /** Acceso vigente de la clave, o `null` si no existe o está revocado. */
  async authenticate(key: string | undefined): Promise<ApiAccess | null> {
    if (!key?.startsWith(KEY_PREFIX) || key.length > 200) return null;
    return this.model
      .findOne({ keyHash: hashKey(key), revokedAt: { $exists: false } })
      .exec();
  }

  /** Motivo por el que se rechaza el origen o la IP, o `null` si pasa. */
  originProblem(
    access: ApiAccess,
    req: { origin?: string; referer?: string; ip?: string },
  ): string | null {
    const host = hostOf(req.origin) ?? hostOf(req.referer);
    // Zapier, Make o un servidor (HU65): sin navegador no hay Origin. Si
    // llega uno y hay dominios, se comprueba igual; las IPs, siempre.
    if (access.purpose === 'automation') {
      if (
        host &&
        access.allowedDomains.length &&
        !domainAllowed(host, access.allowedDomains)
      )
        return `El dominio ${host} no está autorizado para este acceso.`;
      return this.ipProblem(access, req.ip);
    }
    if (!host)
      return 'Falta la cabecera Origin con el dominio autorizado (p. ej. Origin: https://tudominio.com).';
    if (!domainAllowed(host, access.allowedDomains))
      return `El dominio ${host} no está autorizado para este acceso.`;
    return this.ipProblem(access, req.ip);
  }

  private ipProblem(access: ApiAccess, rawIp?: string): string | null {
    if (access.allowedIps.length) {
      const ip = normalizeIp(rawIp);
      if (!ip || !access.allowedIps.includes(ip))
        return 'La IP desde la que llamas no está autorizada para este acceso.';
    }
    return null;
  }

  /** Cuenta un envío; lanza 429 si supera el límite por minuto o por día. */
  async consumeQuota(access: ApiAccess, now = Date.now()): Promise<void> {
    const minute = Math.floor(now / MINUTE_MS);
    const used = await this.bump(
      access._id,
      `m:${minute}`,
      new Date((minute + 2) * MINUTE_MS),
    );
    if (used > access.perMinuteLimit)
      throw new QuotaExceededException(
        Math.max(1, Math.ceil(((minute + 1) * MINUTE_MS - now) / 1000)),
        'minuto',
      );

    const day = Math.floor(now / DAY_MS);
    const usedToday = await this.bump(
      access._id,
      `d:${new Date(day * DAY_MS).toISOString().slice(0, 10)}`,
      new Date((day + 2) * DAY_MS),
    );
    if (usedToday > access.perDayLimit)
      throw new QuotaExceededException(
        Math.max(1, Math.ceil(((day + 1) * DAY_MS - now) / 1000)),
        'día',
      );
  }

  async markUsed(access: ApiAccess): Promise<void> {
    await this.model
      .updateOne(
        { _id: access._id },
        { $set: { lastUsedAt: new Date() }, $inc: { sentCount: 1 } },
      )
      .exec();
  }

  /**
   * La cuenta del acceso, solo si sigue siendo de la empresa y está activa.
   * Se revalida en cada envío: la cuenta pudo borrarse o desconectarse.
   */
  async liveAccount(access: ApiAccess): Promise<AnyAccount> {
    if (access.channel === 'sms') {
      const cfg = await this.sms.findConfig(String(access.tenantId));
      if (!cfg || String(cfg._id) !== String(access.accountId))
        throw new ConflictException(
          'El proveedor SMS de este acceso ya no existe en la plataforma.',
        );
      if (!this.sms.isUsable(cfg))
        throw new ConflictException(
          'El proveedor SMS de este acceso está desactivado o sin URL.',
        );
      return this.smsAccount(cfg);
    }
    const account = (await this.servicesFor(access.channel).findById(
      String(access.accountId),
    )) as AnyAccount | null;
    if (!account || String(account.tenantId) !== String(access.tenantId))
      throw new ConflictException(
        'La cuenta de este acceso ya no existe en la plataforma.',
      );
    if (!account.active)
      throw new ConflictException(
        'La cuenta de este acceso está desconectada o inactiva.',
      );
    return account;
  }

  // ------------------------------------------------------------------

  private async bump(
    accessId: Types.ObjectId,
    bucket: string,
    expiresAt: Date,
  ): Promise<number> {
    const doc = await this.usage
      .findOneAndUpdate(
        { accessId, bucket },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
        { upsert: true, new: true },
      )
      .exec();
    return doc?.count ?? 1;
  }

  private smsAccount(cfg: {
    _id: unknown;
    tenantId: Types.ObjectId;
    name: string;
    from: string;
    enabled: boolean;
  }): AnyAccount {
    return {
      _id: cfg._id,
      tenantId: cfg.tenantId,
      label: cfg.name || 'Proveedor SMS',
      active: cfg.enabled,
      phoneNumber: cfg.from,
    };
  }

  private servicesFor(channel: ChatChannel) {
    if (channel === 'whatsapp') return this.waAccounts;
    if (channel === 'instagram') return this.igAccounts;
    return this.msAccounts;
  }

  private async ownedAccount(
    channel: ApiChannel,
    accountId: string,
    tenantId: string,
  ): Promise<AnyAccount> {
    if (channel === 'sms') {
      const cfg = await this.sms.findConfig(tenantId);
      if (!cfg || String(cfg._id) !== accountId)
        throw new NotFoundException('Proveedor SMS no encontrado');
      return this.smsAccount(cfg);
    }
    // findOne de cada servicio filtra por tenant y lanza 404 si no es suya.
    return await this.servicesFor(channel).findOne(accountId, tenantId);
  }

  private async owned(tenantId: string, id: string): Promise<ApiAccess> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Acceso no encontrado');
    const doc = await this.model
      .findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
      })
      .exec();
    if (!doc) throw new NotFoundException('Acceso no encontrado');
    return doc;
  }

  private newKey(): string {
    return KEY_PREFIX + randomBytes(32).toString('base64url');
  }

  private cleanDomains(list: string[], optional = false): string[] {
    const out: string[] = [];
    for (const raw of list) {
      const domain = normalizeDomain(raw);
      if (!domain)
        throw new BadRequestException(`"${raw}" no es un dominio válido.`);
      if (!out.includes(domain)) out.push(domain);
    }
    if (!out.length && !optional)
      throw new BadRequestException('Autoriza al menos un dominio.');
    return out;
  }

  private cleanIps(list: string[]): string[] {
    const out: string[] = [];
    for (const raw of list) {
      const ip = normalizeIp(raw);
      if (!ip || !isIP(ip))
        throw new BadRequestException(`"${raw}" no es una IP válida.`);
      if (!out.includes(ip)) out.push(ip);
    }
    return out;
  }

  private toView(doc: ApiAccess): ApiAccessView {
    return {
      _id: String(doc._id),
      name: doc.name,
      channel: doc.channel,
      accountId: String(doc.accountId),
      accountLabel: doc.accountLabel,
      keyPrefix: doc.keyPrefix,
      purpose: doc.purpose ?? 'website',
      allowedDomains: doc.allowedDomains,
      allowedIps: doc.allowedIps,
      perMinuteLimit: doc.perMinuteLimit,
      perDayLimit: doc.perDayLimit,
      revoked: !!doc.revokedAt,
      revokedAt: doc.revokedAt,
      lastUsedAt: doc.lastUsedAt,
      sentCount: doc.sentCount,
      webhookUrl: doc.webhookUrl,
      createdAt: doc.createdAt,
    };
  }
}
