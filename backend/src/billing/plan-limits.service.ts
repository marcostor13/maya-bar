import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Tenant } from '../tenants/tenant.schema';
import {
  PLANS,
  isPlanId,
  type LimitKey,
  type PlanFeature,
  type PlanLimits,
} from './plans.catalog';

/** Nombre del recurso para el mensaje al usuario. */
export const LIMIT_LABELS: Record<LimitKey, string> = {
  users: 'usuarios',
  whatsappNumbers: 'números de WhatsApp',
  contacts: 'contactos',
  mailboxes: 'buzones de correo',
  aiAgents: 'agentes de IA',
  activeEvents: 'eventos publicados a la vez',
  campaignEmailsPerMonth: 'emails de campaña de este mes',
  aiCreditsPerMonth: 'créditos de IA de este mes',
};

export const FEATURE_LABELS: Record<PlanFeature, string> = {
  'whatsapp-campaigns': 'Las campañas masivas de WhatsApp',
  events: 'Los eventos',
  'analytics-full': 'La analítica completa',
  'lead-routing': 'El reparto automático de oportunidades',
  automations: 'Las automatizaciones',
  recovery: 'La recuperación de clientes con IA',
  prospecting: 'La prospección con IA',
  'multi-local': 'Las varias sedes',
  'custom-roles': 'Los roles a medida',
  impulsadores: 'Los promotores',
  api: 'La API pública',
  'audit-log': 'El registro de actividad',
};

export class PlanLimitException extends HttpException {
  constructor(resource: LimitKey, limit: number, used: number) {
    super(
      {
        statusCode: 402,
        code: 'PLAN_LIMIT',
        resource,
        limit,
        used,
        message: `Tu plan incluye hasta ${limit} ${LIMIT_LABELS[resource]}. Mejora tu plan o compra un add-on para añadir más.`,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

export class PlanFeatureException extends HttpException {
  constructor(feature: PlanFeature) {
    super(
      {
        statusCode: 402,
        code: 'PLAN_FEATURE',
        feature,
        message: `${FEATURE_LABELS[feature]} no están incluidas en tu plan. Mejóralo para usarlas.`,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

interface LimitsSnapshot {
  plan?: string;
  legacy?: boolean;
  addons?: Partial<Record<LimitKey, number>>;
}

export interface EffectiveLimits {
  /** Sin límites: cliente anterior al catálogo o plan Empresa. */
  unlimited: boolean;
  limits: PlanLimits;
  features: PlanFeature[];
}

const startOfMonthUtc = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/**
 * Límites del plan más add-ons (HU42). Cuenta el uso directamente en la
 * conexión, por nombre de modelo, para no depender de cada módulo.
 */
@Injectable()
export class PlanLimitsService {
  constructor(
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
    @InjectConnection() private connection: Connection,
  ) {}

  async effective(tenantId: string): Promise<EffectiveLimits> {
    const t = Types.ObjectId.isValid(tenantId)
      ? await this.tenants
          .findById(tenantId)
          .select('plan legacy addons')
          .lean<LimitsSnapshot>()
          .exec()
      : null;
    const plan = PLANS[isPlanId(t?.plan) ? t.plan : 'inicia'];
    const unlimited = !t || !!t.legacy || !!plan.custom;
    const limits = { ...plan.limits };
    for (const [k, extra] of Object.entries(t?.addons ?? {})) {
      const key = k as LimitKey;
      if (limits[key] != null && typeof extra === 'number')
        limits[key] = limits[key] + extra;
    }
    return { unlimited, limits, features: plan.features };
  }

  private count(model: string, filter: object): Promise<number> {
    if (!this.connection.models[model]) return Promise.resolve(0);
    return this.connection.model(model).countDocuments(filter).exec();
  }

  /** Uso actual de un recurso. */
  async usage(
    tenantId: string,
    key: LimitKey,
    now = new Date(),
  ): Promise<number> {
    const tid = new Types.ObjectId(tenantId);
    switch (key) {
      case 'users':
        return this.count('User', {
          tenantId: tid,
          isActive: { $ne: false },
          role: { $ne: 'SUPERADMIN' },
        });
      case 'whatsappNumbers':
        return this.count('WhatsAppAccount', { tenantId: tid });
      case 'mailboxes':
        return this.count('EmailAccount', { tenantId: tid });
      case 'aiAgents':
        return this.count('AiAgent', { tenantId: tid });
      case 'contacts':
        return this.count('Customer', { tenantId: tid });
      case 'activeEvents':
        return this.count('Event', {
          tenantId: tid,
          status: 'published',
          date: { $gte: new Date(now.getTime() - 86_400_000) },
        });
      case 'campaignEmailsPerMonth': {
        if (!this.connection.models.Campaign) return 0;
        const ids = await this.connection
          .model('Campaign')
          .find({ tenantId: tid, type: 'email' }, { _id: 1 })
          .lean<{ _id: Types.ObjectId }[]>()
          .exec();
        if (!ids.length) return 0;
        return this.count('CampaignRecipient', {
          tenantId: tid,
          campaignId: { $in: ids.map((c) => c._id) },
          status: 'sent',
          sentAt: { $gte: startOfMonthUtc(now) },
        });
      }
      case 'aiCreditsPerMonth':
        // Lo mide el libro de créditos (HU43).
        return 0;
    }
  }

  /** 402 `PLAN_LIMIT` si añadir `adding` unidades supera el límite. */
  async assertCanAdd(
    tenantId: string,
    key: LimitKey,
    adding = 1,
  ): Promise<void> {
    if (!tenantId) return;
    // Los créditos tienen su propio control con recargas: AiCreditsService.
    if (key === 'aiCreditsPerMonth')
      throw new Error(
        'Usa AiCreditsService.assertCanSpend para créditos de IA',
      );
    const eff = await this.effective(tenantId);
    const limit = eff.limits[key];
    if (eff.unlimited || limit == null) return;
    const used = await this.usage(tenantId, key);
    if (used + adding > limit) throw new PlanLimitException(key, limit, used);
  }

  /**
   * Cupo de emails de campaña (HU42 + HU53). Lleva un contador atómico de lo
   * encolado en el mes (dos campañas a la vez no ven el mismo cupo libre y un
   * reenvío no lo libera). Lo que pase del plan sale de la recarga comprada;
   * si no alcanza, 402 `PLAN_LIMIT` y no se reserva nada. Devuelve la reserva
   * para poder devolverla si el encolado falla.
   */
  async reserveCampaignEmails(
    tenantId: string,
    adding: number,
    now = new Date(),
  ): Promise<{ adding: number; fromPurchased: number; period: string } | null> {
    if (!tenantId || adding <= 0) return null;
    const key: LimitKey = 'campaignEmailsPerMonth';
    const eff = await this.effective(tenantId);
    const limit = eff.limits[key];
    if (eff.unlimited || limit == null) return null;
    const _id = new Types.ObjectId(tenantId);
    const period = now.toISOString().slice(0, 7);
    // Mes nuevo: el contador parte de lo ya enviado este mes.
    const sent = await this.usage(tenantId, key, now);
    await this.tenants
      .updateOne(
        { _id, 'emailQuota.period': { $ne: period } },
        { $set: { emailQuota: { period, queued: sent } } },
      )
      .exec();
    const after = await this.tenants
      .findOneAndUpdate(
        { _id, 'emailQuota.period': period },
        { $inc: { 'emailQuota.queued': adding } },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();
    const total = after?.emailQuota?.queued ?? adding;
    const before = total - adding;
    const fromPurchased =
      Math.max(0, total - limit) - Math.max(0, before - limit);
    const undo = () =>
      this.tenants
        .updateOne(
          { _id, 'emailQuota.period': period },
          { $inc: { 'emailQuota.queued': -adding } },
        )
        .exec();
    if (fromPurchased > 0) {
      const res = await this.tenants
        .updateOne(
          {
            _id,
            campaignEmailsPurchased: { $gte: fromPurchased },
            $or: [
              { campaignEmailsPurchasedExpiresAt: { $exists: false } },
              { campaignEmailsPurchasedExpiresAt: { $gt: now } },
            ],
          },
          { $inc: { campaignEmailsPurchased: -fromPurchased } },
        )
        .exec();
      if (res.modifiedCount !== 1) {
        await undo();
        throw new PlanLimitException(key, limit, Math.min(before, limit));
      }
    }
    return { adding, fromPurchased, period };
  }

  /** Devuelve una reserva de emails si el encolado falló. */
  async refundCampaignEmails(
    tenantId: string,
    r: { adding: number; fromPurchased: number; period: string } | null,
  ): Promise<void> {
    if (!r) return;
    const _id = new Types.ObjectId(tenantId);
    await this.tenants
      .updateOne(
        { _id, 'emailQuota.period': r.period },
        { $inc: { 'emailQuota.queued': -r.adding } },
      )
      .exec();
    if (r.fromPurchased > 0)
      await this.tenants
        .updateOne(
          { _id },
          { $inc: { campaignEmailsPurchased: r.fromPurchased } },
        )
        .exec();
  }

  /** 402 `PLAN_FEATURE` si la función no está en el plan. */
  async assertFeature(tenantId: string, feature: PlanFeature): Promise<void> {
    if (!tenantId) return;
    const eff = await this.effective(tenantId);
    if (eff.unlimited || eff.features.includes(feature)) return;
    throw new PlanFeatureException(feature);
  }
}
