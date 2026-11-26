import { brandForTenant, MAYA_BRAND } from '../agency/white-label';
import type { MailBrand } from '../mail/mail.service';
import {
  PERIOD_MONTHS,
  PLAN_RANK,
  addMonths,
  isPlanId,
} from '../billing/plans.catalog';
import type { BillingPeriod, Currency } from '../billing/plans.catalog';
import { discountEndsAt } from '../billing/coupons/coupon-math';
import {
  BadRequestException,
  Injectable,
  ConflictException,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { BillingAccessService } from '../billing/billing-access.service';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Schema, SchemaType, Types } from 'mongoose';
import { Tenant } from './tenant.schema';
import { TenantAudit, type TenantAuditAction } from './tenant-audit.schema';

/** Cuánto se recuerda si una empresa está activa (las sesiones la consultan en cada petición). */
const ACTIVE_TTL_MS = 60_000;
const DAY_MS = 24 * 3600_000;

/** Quién hace un cambio de plataforma. */
export interface TenantActor {
  userId: string;
  email?: string;
}

export interface TenantUsage {
  contacts: number;
  conversations: number;
  messagesOut30d: number;
  accounts: {
    whatsapp: number;
    instagram: number;
    messenger: number;
    email: number;
    sms: number;
  };
  apiAccesses: number;
}

/** Campos que se registran al editar una empresa. */
const AUDITED_FIELDS = [
  'name',
  'email',
  'ruc',
  'phone',
  'plan',
  'planExpiresAt',
  'trialEndsAt',
  'legacy',
] as const;

export interface TenantUpdate {
  name?: string;
  email?: string;
  ruc?: string;
  phone?: string;
  plan?: Tenant['plan'];
  planExpiresAt?: string | null;
  trialEndsAt?: string | null;
  isActive?: boolean;
  legacy?: boolean;
}

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);
  private readonly activeCache = new Map<
    string,
    { active: boolean; expiresAt: number }
  >();

  constructor(
    @InjectModel(Tenant.name) private tenantModel: Model<Tenant>,
    @InjectConnection() private connection: Connection,
    @InjectModel(TenantAudit.name) private auditModel: Model<TenantAudit>,
    // Caché del estado de cobro (HU41); opcional para las pruebas unitarias.
    @Optional() private billing?: BillingAccessService,
  ) {}

  async findAll(): Promise<Tenant[]> {
    return this.tenantModel.find().sort({ createdAt: -1 }).exec();
  }

  async create(data: {
    name: string;
    email: string;
    ruc?: string;
    phone?: string;
    plan?: Tenant['plan'];
    acquisition?: Tenant['acquisition'];
  }): Promise<Tenant> {
    const slug = this.slugify(data.name);
    const exists = await this.tenantModel.findOne({
      $or: [{ email: data.email }, { slug }],
    });
    if (exists)
      throw new ConflictException('Email or business name already registered');

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    // Prueba de 14 días con todo el plan Crece (HU41).
    const tenant = new this.tenantModel({
      plan: 'crece',
      ...data,
      slug,
      trialEndsAt,
      subscription: { status: 'trialing' },
    });
    try {
      return await tenant.save();
    } catch (err: unknown) {
      // Dos altas simultáneas pasan la comprobación de arriba; el índice único
      // rechaza la segunda.
      if ((err as { code?: number }).code === 11000)
        throw new ConflictException(
          'Email or business name already registered',
        );
      throw err;
    }
  }

  /**
   * Activa un plan pagado (HU47). Si quedaba periodo vigente, el nuevo se suma
   * al final; si no, empieza hoy.
   */
  async activatePlan(
    tenantId: string | Types.ObjectId,
    p: {
      plan: Tenant['plan'];
      period: BillingPeriod;
      currency: Currency;
      amount: number;
      mpPreapprovalId?: string;
      /** Cupón con el que se compró (HU54): queda como precio pactado. */
      /** Renovación del mismo plan (HU48): conserva el descuento pactado. */
      renewal?: boolean;
      coupon?: {
        code: string;
        type: 'percent' | 'fixed';
        value: number;
        duration: 'once' | 'months' | 'forever';
        durationMonths?: number;
        plans?: string[];
        periods?: string[];
      };
    },
    now = new Date(),
  ): Promise<void> {
    const tenant = await this.tenantModel.findById(tenantId).exec();
    if (!tenant) throw new NotFoundException('Tenant not found');
    const prevEnd = tenant.subscription?.currentPeriodEnd;
    const st = tenant.subscription?.status;
    // Desde el fin vigente: si sigue activa, o si pagó la renovación estando
    // en impago (la gracia ya la usó). Si no, desde hoy.
    const oldPre = tenant.subscription?.mpPreapprovalId;
    // Suscripción automática nueva: Mercado Pago cobra desde hoy, así que el
    // periodo también empieza hoy (HU51); la anterior se cancela.
    const replaced =
      p.mpPreapprovalId && oldPre && oldPre !== p.mpPreapprovalId
        ? oldPre
        : undefined;
    const base =
      !p.mpPreapprovalId &&
      prevEnd &&
      ((st === 'active' && prevEnd > now) ||
        (st === 'past_due' &&
          prevEnd.getTime() > now.getTime() - 31 * 86400_000))
        ? prevEnd
        : now;
    const from = addMonths(base, PERIOD_MONTHS[p.period]);
    const current = isPlanId(tenant.plan) ? tenant.plan : undefined;
    // N meses cuentan desde que empieza el periodo pagado; en mensual automático
    // el descuento de una vez termina 2 días antes del cobro, para que el monto
    // nuevo llegue a Mercado Pago a tiempo (HU54).
    let couponEnds = p.coupon
      ? discountEndsAt(p.coupon, from, base)
      : undefined;
    if (couponEnds && p.coupon?.duration === 'once' && p.mpPreapprovalId)
      couponEnds = new Date(couponEnds.getTime() - 2 * 86400_000);
    // Renovación pagada por adelantado a un plan menor (bajada, HU52): el plan
    // actual sigue hasta el fin del periodo pagado y el nuevo entra entonces.
    const scheduled =
      base === prevEnd &&
      prevEnd > now &&
      !!current &&
      PLAN_RANK[p.plan] < PLAN_RANK[current];
    // Renovó el mismo plan con una bajada programada después del aviso: la
    // bajada se conserva para la siguiente renovación.
    const keepPending =
      !scheduled && current === p.plan && !!tenant.subscription?.pendingPlan;
    await this.tenantModel
      .updateOne(
        { _id: tenant._id },
        {
          $set: {
            ...(scheduled
              ? {
                  'subscription.pendingPlan': p.plan,
                  'subscription.pendingPlanFrom': base,
                }
              : { plan: p.plan }),
            legacy: false,
            'subscription.status': 'active',
            'subscription.period': p.period,
            'subscription.currency': p.currency,
            ...(scheduled ? {} : { 'subscription.amount': p.amount }),
            'subscription.currentPeriodEnd': from,
            ...(p.mpPreapprovalId
              ? { 'subscription.mpPreapprovalId': p.mpPreapprovalId }
              : {}),
            ...(p.coupon
              ? {
                  'subscription.discount': {
                    code: p.coupon.code,
                    type: p.coupon.type,
                    value: p.coupon.value,
                    ...(p.coupon.plans?.length
                      ? { plans: p.coupon.plans }
                      : {}),
                    ...(p.coupon.periods?.length
                      ? { periods: p.coupon.periods }
                      : {}),
                    ...(couponEnds ? { endsAt: couponEnds } : {}),
                  },
                }
              : {}),
          },
          $unset: {
            'subscription.graceEndsAt': '',
            'subscription.pastDueSince': '',
            'subscription.longExpiredNoticeAt': '',
            // Compra nueva sin cupón (no renovación): el descuento anterior no sigue.
            ...(!p.coupon && !p.renewal ? { 'subscription.discount': '' } : {}),
            ...(scheduled || keepPending
              ? {}
              : {
                  'subscription.pendingPlan': '',
                  'subscription.pendingPlanFrom': '',
                }),
            'subscription.cancelAtPeriodEnd': '',
            'subscription.canceledAt': '',
          },
          ...(replaced
            ? { $addToSet: { 'subscription.preapprovalsToCancel': replaced } }
            : {}),
        },
      )
      .exec();
    this.billing?.invalidate(String(tenant._id));
  }

  /** Datos de facturación tomados del checkout (HU47). */
  async setBillingInfo(
    tenantId: string | Types.ObjectId,
    info: Record<string, unknown>,
  ): Promise<void> {
    await this.tenantModel
      .updateOne({ _id: tenantId }, { $set: { billingInfo: info } })
      .exec();
  }

  /** Nombre de empresa libre: «Acme», «Acme 2», «Acme 3»… */
  async uniqueName(name: string): Promise<string> {
    for (let i = 1; i < 50; i++) {
      const candidate = i === 1 ? name : `${name} ${i}`;
      if (!(await this.tenantModel.exists({ slug: this.slugify(candidate) })))
        return candidate;
    }
    return `${name} ${Date.now().toString(36)}`;
  }

  /** Marca para los correos de plataforma de sus usuarios (HU72). */
  async mailBrandFor(tenantId?: string | null): Promise<MailBrand | undefined> {
    if (!tenantId) return undefined;
    const b = await brandForTenant(this.tenantModel, tenantId);
    return b === MAYA_BRAND ? undefined : { appName: b.appName, logo: b.logo };
  }

  /** ¿`childId` es sub-cuenta de la agencia `parentId`? (HU72) */
  async isSubAccountOf(childId: string, parentId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(childId) || !Types.ObjectId.isValid(parentId))
      return false;
    const [child, parent] = await Promise.all([
      this.tenantModel
        .exists({
          _id: new Types.ObjectId(childId),
          parentTenantId: new Types.ObjectId(parentId),
        })
        .exec(),
      this.tenantModel
        .exists({
          _id: new Types.ObjectId(parentId),
          agency: { $exists: true },
        })
        .exec(),
    ]);
    return !!child && !!parent;
  }

  async findById(id: string): Promise<Tenant> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Tenant not found');
    const tenant = await this.tenantModel.findById(id).exec();
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  /**
   * ¿La empresa puede usar la plataforma? (HU16). Sin empresa (SUPERADMIN) o si
   * no existe el campo, sí. Se cachea un minuto; `update` invalida al momento.
   */
  async isActive(tenantId?: string | null): Promise<boolean> {
    if (!tenantId || !Types.ObjectId.isValid(tenantId)) return true;
    const cached = this.activeCache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) return cached.active;
    const t = await this.tenantModel
      .findById(tenantId)
      .select('isActive')
      .lean<{ isActive?: boolean }>()
      .exec();
    // Una empresa borrada tampoco deja usar sus sesiones.
    const active = !!t && t.isActive !== false;
    this.activeCache.set(tenantId, {
      active,
      expiresAt: Date.now() + ACTIVE_TTL_MS,
    });
    return active;
  }

  /**
   * Edición. Con `actor` (superadmin) valida el correo, registra los cambios y
   * la suspensión o reactivación.
   */
  async update(
    id: string,
    data: TenantUpdate,
    actor?: TenantActor,
  ): Promise<Tenant> {
    const tenant = await this.findById(id);
    const email = data.email?.trim().toLowerCase();
    if (email && email !== tenant.email) {
      const taken = await this.tenantModel
        .exists({ email, _id: { $ne: tenant._id } })
        .exec();
      if (taken)
        throw new ConflictException('Ese correo ya lo usa otra empresa.');
    }

    const set: Record<string, unknown> = {};
    const unset: Record<string, 1> = {};
    if (data.name !== undefined) set.name = data.name.trim();
    if (email) set.email = email;
    if (data.ruc !== undefined) set.ruc = data.ruc.trim();
    if (data.phone !== undefined) set.phone = data.phone.trim();
    if (data.plan !== undefined) set.plan = data.plan;
    for (const key of ['planExpiresAt', 'trialEndsAt'] as const) {
      const value = data[key];
      if (value === null || value === '') unset[key] = 1;
      else if (value !== undefined) set[key] = new Date(value);
    }
    if (data.isActive !== undefined) set.isActive = data.isActive;
    if (data.legacy !== undefined) set.legacy = data.legacy;
    // Alargar la prueba (HU41): una fecha futura reabre una prueba vencida.
    if (
      set.trialEndsAt instanceof Date &&
      set.trialEndsAt > new Date() &&
      (!tenant.subscription ||
        ['trialing', 'expired'].includes(tenant.subscription.status))
    )
      set['subscription.status'] = 'trialing';
    // Quitar `legacy` a un cliente sin suscripción no debe bloquearlo de golpe:
    // queda activo y el superadmin gestiona su cobro (HU40, HU41).
    if (data.legacy === false && tenant.legacy && !tenant.subscription)
      set.subscription = { status: 'active' };

    const changes: Record<string, { from?: unknown; to?: unknown }> = {};
    for (const key of AUDITED_FIELDS) {
      if (!(key in set) && !(key in unset)) continue;
      const from = this.plain(tenant.get(key));
      const to = this.plain(set[key]);
      if (from !== to) changes[key] = { from, to };
    }

    let saved: Tenant | null;
    try {
      saved = await this.tenantModel
        .findByIdAndUpdate(
          id,
          {
            $set: set,
            ...(Object.keys(unset).length ? { $unset: unset } : {}),
          },
          { new: true, runValidators: true },
        )
        .exec();
    } catch (err) {
      if ((err as { code?: number }).code === 11000)
        throw new ConflictException('Ese correo ya lo usa otra empresa.');
      throw err;
    }
    if (!saved) throw new NotFoundException('Tenant not found');
    this.activeCache.delete(String(saved._id));
    this.billing?.invalidate(String(saved._id));

    if (actor) {
      if (Object.keys(changes).length)
        await this.audit(actor, saved, 'update', changes);
      if (
        data.isActive !== undefined &&
        data.isActive !== (tenant.isActive !== false)
      )
        await this.audit(
          actor,
          saved,
          data.isActive ? 'reactivate' : 'suspend',
        );
    }
    return saved;
  }

  /** Logo y favicon de la empresa (HU26). `null` o '' los quita. */
  async updateBranding(
    id: string,
    data: { logo?: string | null; favicon?: string | null },
  ): Promise<{ logo?: string; favicon?: string }> {
    const set: Record<string, string> = {};
    const unset: Record<string, 1> = {};
    for (const key of ['logo', 'favicon'] as const) {
      const value = data[key];
      if (value === undefined) continue;
      const url = (value ?? '').trim();
      if (url) set[`branding.${key}`] = url;
      else unset[`branding.${key}`] = 1;
    }
    const saved = await this.tenantModel
      .findByIdAndUpdate(
        id,
        {
          ...(Object.keys(set).length ? { $set: set } : {}),
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
        },
        { new: true },
      )
      .exec();
    if (!saved) throw new NotFoundException('Tenant not found');
    return { logo: saved.branding?.logo, favicon: saved.branding?.favicon };
  }

  /**
   * Elimina el tenant y todos los documentos que le pertenecen: cualquier
   * modelo registrado con un campo `tenantId` (usuarios, pedidos, locales...).
   * El superadmin confirma escribiendo el nombre exacto (HU16).
   */
  async remove(
    id: string,
    opts: { confirmName?: string; actor?: TenantActor } = {},
  ): Promise<{ deleted: true }> {
    const tenant = await this.findById(id);
    if (opts.actor && opts.confirmName?.trim() !== tenant.name)
      throw new BadRequestException(
        'Escribe el nombre exacto de la empresa para eliminarla.',
      );

    const oid = new Types.ObjectId(id);
    for (const model of Object.values(this.connection.models)) {
      if (model.modelName === TenantAudit.name) continue;
      const schema = model.schema as Schema;
      const path: SchemaType | undefined = schema.path('tenantId');
      if (!path) continue;
      // Las dos formas a la vez: `@Prop({ type: Types.ObjectId })` deja la ruta
      // como Mixed, así que Mongoose no convierte el valor y un filtro con el
      // id en texto no encuentra los documentos guardados como ObjectId.
      await model.deleteMany({ tenantId: { $in: [oid, id] } }).exec();
    }
    await this.tenantModel.deleteOne({ _id: oid }).exec();
    this.activeCache.delete(id);
    // El registro de la eliminación sobrevive a la empresa.
    if (opts.actor) await this.audit(opts.actor, tenant, 'delete');
    return { deleted: true };
  }

  /** Uso de la empresa para su ficha (HU16). */
  async usage(id: string): Promise<TenantUsage> {
    const tenantId = new Types.ObjectId(id);
    const count = async (
      modelName: string,
      extra: Record<string, unknown> = {},
    ): Promise<number> => {
      const model = this.connection.models[modelName];
      if (!model) return 0;
      return model
        .countDocuments({ tenantId: { $in: [tenantId, id] }, ...extra })
        .exec();
    };
    const since = new Date(Date.now() - 30 * DAY_MS);
    const [
      contacts,
      conversations,
      messagesOut30d,
      whatsapp,
      instagram,
      messenger,
      email,
      sms,
      apiAccesses,
    ] = await Promise.all([
      count('Customer'),
      count('Conversation'),
      count('Message', { direction: 'out', at: { $gte: since } }),
      count('WhatsAppAccount'),
      count('InstagramAccount'),
      count('MessengerAccount'),
      count('EmailAccount'),
      count('SmsConfig'),
      count('ApiAccess', { revokedAt: { $exists: false } }),
    ]);
    return {
      contacts,
      conversations,
      messagesOut30d,
      accounts: { whatsapp, instagram, messenger, email, sms },
      apiAccesses,
    };
  }

  async auditLog(id: string): Promise<TenantAudit[]> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Tenant not found');
    return this.auditModel
      .find({ tenantId: new Types.ObjectId(id) })
      .sort({ at: -1 })
      .limit(100)
      .exec();
  }

  /** Deja constancia de una acción de plataforma. Un fallo no la deshace. */
  async audit(
    actor: TenantActor,
    tenant: Pick<Tenant, '_id' | 'name'>,
    action: TenantAuditAction,
    changes?: Record<string, { from?: unknown; to?: unknown }>,
  ): Promise<void> {
    try {
      await this.auditModel.create({
        tenantId: tenant._id,
        tenantName: tenant.name,
        actorId: Types.ObjectId.isValid(actor.userId)
          ? new Types.ObjectId(actor.userId)
          : undefined,
        actorEmail: actor.email,
        action,
        changes,
        at: new Date(),
      });
    } catch (err) {
      this.logger.error(
        `No se pudo registrar ${action} de la empresa ${String(tenant._id)}: ${String(err)}`,
      );
    }
  }

  /** Fechas a `AAAA-MM-DD` y vacíos a `undefined`, para comparar y registrar. */
  private plain(value: unknown): unknown {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (value === null || value === '') return undefined;
    return value;
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
