import {
  BadRequestException,
  Injectable,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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
  ) {}

  async findAll(): Promise<Tenant[]> {
    return this.tenantModel.find().sort({ createdAt: -1 }).exec();
  }

  async create(data: {
    name: string;
    email: string;
    ruc?: string;
    phone?: string;
  }): Promise<Tenant> {
    const slug = this.slugify(data.name);
    const exists = await this.tenantModel.findOne({
      $or: [{ email: data.email }, { slug }],
    });
    if (exists)
      throw new ConflictException('Email or business name already registered');

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    const tenant = new this.tenantModel({ ...data, slug, trialEndsAt });
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
