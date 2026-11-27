import { estimateCostUsd } from './ai-cost';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Tenant } from '../tenants/tenant.schema';
import { PlanLimitsService } from './plan-limits.service';
import {
  CREDIT_COSTS,
  UsageLedger,
  type AiAction,
} from './usage-ledger.schema';

export const NO_CREDITS_MESSAGE =
  'Te quedaste sin créditos de IA este mes. Compra una recarga o mejora tu plan.';

export class AiCreditsException extends HttpException {
  constructor() {
    super(
      { statusCode: 402, code: 'AI_CREDITS', message: NO_CREDITS_MESSAGE },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

export interface AiUsage {
  byok: boolean;
  /** Cuenta de IA de la plataforma (HU85): gratis para la empresa, costo para Maya. */
  platform?: boolean;
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface CreditBalance {
  period: string;
  unlimited: boolean;
  /** Créditos del plan para el mes (no se acumulan). */
  included: number;
  /** Consumidos de los del plan este mes. */
  usedFromPlan: number;
  /** Recargas vigentes. */
  purchased: number;
  purchasedExpiresAt?: Date;
  remaining: number;
}

export const periodOf = (now: Date) => now.toISOString().slice(0, 7);

/** Libro de créditos de IA por empresa (HU43). */
@Injectable()
export class AiCreditsService {
  private readonly logger = new Logger(AiCreditsService.name);
  /** Avisos tras cada consumo (correos al 80 % y 100 %, HU50). */
  private usageHandlers: ((
    tenantId: string,
    b: CreditBalance,
  ) => Promise<void>)[] = [];

  onUsage(h: (tenantId: string, b: CreditBalance) => Promise<void>) {
    this.usageHandlers.push(h);
  }

  constructor(
    @InjectModel(UsageLedger.name) private ledger: Model<UsageLedger>,
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
    private limits: PlanLimitsService,
  ) {}

  async balance(tenantId: string, now = new Date()): Promise<CreditBalance> {
    const period = periodOf(now);
    const tid = new Types.ObjectId(tenantId);
    const [eff, t, agg] = await Promise.all([
      this.limits.effective(tenantId),
      this.tenants
        .findById(tid)
        .select('aiCreditsPurchased aiCreditsPurchasedExpiresAt')
        .lean<{
          aiCreditsPurchased?: number;
          aiCreditsPurchasedExpiresAt?: Date;
        }>()
        .exec(),
      this.ledger
        .aggregate<{ fromPlan: number }>([
          { $match: { tenantId: tid, period } },
          {
            $group: {
              _id: null,
              fromPlan: { $sum: { $subtract: ['$credits', '$fromPurchased'] } },
            },
          },
        ])
        .exec(),
    ]);
    const included = eff.limits.aiCreditsPerMonth ?? 0;
    const usedFromPlan = agg[0]?.fromPlan ?? 0;
    const expires = t?.aiCreditsPurchasedExpiresAt
      ? new Date(t.aiCreditsPurchasedExpiresAt)
      : undefined;
    const purchased =
      expires && expires <= now ? 0 : Math.max(0, t?.aiCreditsPurchased ?? 0);
    const unlimited = eff.unlimited || eff.limits.aiCreditsPerMonth == null;
    return {
      period,
      unlimited,
      included,
      usedFromPlan,
      purchased,
      purchasedExpiresAt: purchased ? expires : undefined,
      remaining: Math.max(0, included - usedFromPlan) + purchased,
    };
  }

  /** 402 `AI_CREDITS` si no alcanza el saldo para la acción. */
  async assertCanSpend(
    tenantId: string,
    action: AiAction,
    units = 1,
  ): Promise<void> {
    const b = await this.balance(tenantId);
    if (!b.unlimited && b.remaining < CREDIT_COSTS[action] * units)
      throw new AiCreditsException();
  }

  /** Consumo del mes por empresa, para el dueño de la plataforma (HU43, HU57). */
  async usageByTenant(period = periodOf(new Date())) {
    return this.ledger
      .aggregate<{
        _id: Types.ObjectId;
        credits: number;
        costUsd: number;
        calls: number;
        byokCalls: number;
      }>([
        { $match: { period } },
        {
          $group: {
            _id: '$tenantId',
            credits: { $sum: '$credits' },
            costUsd: { $sum: '$costUsd' },
            calls: { $sum: 1 },
            byokCalls: { $sum: { $cond: ['$byok', 1, 0] } },
          },
        },
        { $sort: { costUsd: -1 } },
      ])
      .exec();
  }

  /**
   * Costo real por acción en el mes (HU66): llamadas, unidades y US$ por
   * unidad. En `recovery` la unidad es una conversación analizada; sirve para
   * fijar los créditos de cada acción (HU43). Excluye las llamadas con key propia.
   */
  async usageByAction(period = periodOf(new Date())) {
    const rows = await this.ledger
      .aggregate<{
        _id: string;
        calls: number;
        units: number;
        credits: number;
        costUsd: number;
        inputTokens: number;
        outputTokens: number;
      }>([
        { $match: { period, byok: { $ne: true } } },
        {
          $group: {
            _id: '$action',
            calls: { $sum: 1 },
            units: { $sum: { $ifNull: ['$units', 1] } },
            credits: { $sum: '$credits' },
            costUsd: { $sum: '$costUsd' },
            inputTokens: { $sum: '$inputTokens' },
            outputTokens: { $sum: '$outputTokens' },
          },
        },
        { $sort: { costUsd: -1 } },
      ])
      .exec();
    return rows.map(({ _id, ...r }) => ({
      action: _id,
      ...r,
      costPerUnitUsd: r.units ? r.costUsd / r.units : 0,
      creditsPerUnit: r.units ? r.credits / r.units : 0,
    }));
  }

  /** Anota el consumo; descuenta recargas solo si ya se usó lo del plan. */
  async record(
    tenantId: string,
    action: AiAction,
    usage: AiUsage,
    units = 1,
  ): Promise<void> {
    try {
      const now = new Date();
      const credits =
        usage.byok || usage.platform ? 0 : CREDIT_COSTS[action] * units;
      let fromPurchased = 0;
      if (credits) {
        const b = await this.balance(tenantId, now);
        if (!b.unlimited) {
          const planLeft = Math.max(0, b.included - b.usedFromPlan);
          fromPurchased = Math.min(
            b.purchased,
            Math.max(0, credits - planLeft),
          );
          if (fromPurchased)
            await this.tenants
              .updateOne(
                { _id: tenantId },
                { $inc: { aiCreditsPurchased: -fromPurchased } },
              )
              .exec();
        }
      }
      await this.ledger.create({
        tenantId: new Types.ObjectId(tenantId),
        period: periodOf(now),
        action,
        units,
        credits,
        fromPurchased,
        byok: usage.byok,
        platformAi: !!usage.platform,
        provider: usage.provider,
        aiModel: usage.model,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        costUsd: usage.byok
          ? 0
          : estimateCostUsd(
              usage.model,
              usage.provider,
              usage.inputTokens,
              usage.outputTokens,
            ),
      });
      if (credits && this.usageHandlers.length) {
        const after = await this.balance(tenantId, now);
        for (const h of this.usageHandlers) await h(tenantId, after);
      }
    } catch (err) {
      // Medir nunca debe romper la respuesta que ya se generó.
      this.logger.warn(`No se pudo anotar el consumo de IA: ${String(err)}`);
    }
  }
}
