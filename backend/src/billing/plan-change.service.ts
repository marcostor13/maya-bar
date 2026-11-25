import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { Tenant } from '../tenants/tenant.schema';
import { User } from '../users/user.schema';
import {
  LIMIT_KEYS,
  PLAN_RANK,
  PLANS,
  isPlanId,
  prorate,
  withIgv,
  type LimitKey,
  type PlanId,
} from './plans.catalog';
import { PlanLimitsService } from './plan-limits.service';
import { agreedPrice } from './agreed-price';
import { BillingAccessService } from './billing-access.service';
import { MercadoPagoClient } from './mercadopago/mercadopago.client';
import { CheckoutService } from './checkout.service';
import { BillingMailer } from './emails/billing-mailer.service';
import { T } from './emails/billing-email.templates';

const SELF_SERVE: PlanId[] = ['inicia', 'crece', 'escala'];

export interface Excess {
  key: LimitKey;
  used: number;
  limit: number;
}

/**
 * Cambio de plan y cancelación por el propio cliente (HU52): subir con cobro
 * prorrateado, bajar al fin del periodo eligiendo qué usuarios conservar,
 * cancelar al fin del periodo y reactivar antes de que termine.
 */
@Injectable()
export class PlanChangeService {
  private readonly logger = new Logger(PlanChangeService.name);

  constructor(
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
    @InjectModel(User.name) private users: Model<User>,
    private limits: PlanLimitsService,
    private access: BillingAccessService,
    private mp: MercadoPagoClient,
    private checkout: CheckoutService,
    private mailer: BillingMailer,
  ) {}

  private async paidTenant(tenantId: string, allowPastDue = false) {
    const t = await this.tenants.findById(tenantId).exec();
    const sub = t?.subscription;
    if (
      !t ||
      !sub ||
      !(
        sub.status === 'active' ||
        (allowPastDue && sub.status === 'past_due')
      ) ||
      !sub.period ||
      !sub.currency ||
      !sub.currentPeriodEnd
    )
      throw new BadRequestException(
        'Tu cuenta no tiene un plan pagado activo: elige un plan para empezar.',
      );
    return { t, sub };
  }

  /** Recursos que quedarían por encima de los límites del plan destino. */
  async excessFor(tenantId: string, plan: PlanId): Promise<Excess[]> {
    const t = await this.tenants
      .findById(tenantId)
      .select('addons')
      .lean()
      .exec();
    // Los add-ons comprados se conservan al cambiar de plan.
    const addons =
      (t as unknown as { addons?: Record<string, number> })?.addons ?? {};
    const target = PLANS[plan].limits;
    const out: Excess[] = [];
    for (const key of LIMIT_KEYS) {
      const base = target[key];
      if (
        base == null ||
        key === 'aiCreditsPerMonth' ||
        key === 'campaignEmailsPerMonth'
      )
        continue;
      const limit = base + (typeof addons[key] === 'number' ? addons[key] : 0);
      const used = await this.limits.usage(tenantId, key);
      if (used > limit) out.push({ key, used, limit });
    }
    return out;
  }

  /** Opciones para la pantalla Mi plan. */
  async options(tenantId: string, now = new Date()) {
    const t = await this.tenants.findById(tenantId).lean().exec();
    const sub = t?.subscription;
    const current = isPlanId(t?.plan) ? t.plan : 'inicia';
    const paid =
      (sub?.status === 'active' || sub?.status === 'past_due') &&
      !!sub.period &&
      !!sub.currency &&
      !!sub.currentPeriodEnd;
    const users = await this.users
      .find({
        tenantId: new Types.ObjectId(tenantId),
        role: { $ne: 'SUPERADMIN' },
        isActive: { $ne: false },
      })
      .select('name email role')
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    const plans = await Promise.all(
      SELF_SERVE.filter((p) => p !== current).map(async (plan) => {
        const up = PLAN_RANK[plan] > PLAN_RANK[current];
        const price = paid
          ? agreedPrice(t, plan, sub.period!, sub.currency!)
          : null;
        const due =
          up && paid && price != null
            ? prorate({
                oldAmount: sub.amount ?? 0,
                newAmount: price,
                period: sub.period!,
                periodEnd: sub.currentPeriodEnd!,
                now,
              })
            : 0;
        return {
          plan,
          name: PLANS[plan].name,
          direction: up ? 'up' : 'down',
          price,
          dueNow: due,
          dueNowWithIgv: sub?.currency === 'PEN' ? withIgv(due) : due,
          excess: up ? [] : await this.excessFor(tenantId, plan),
        };
      }),
    );
    return {
      current,
      paid,
      pastDue: sub?.status === 'past_due',
      period: sub?.period,
      currency: sub?.currency,
      currentPeriodEnd: sub?.currentPeriodEnd,
      cancelAtPeriodEnd: !!sub?.cancelAtPeriodEnd,
      pendingPlan: sub?.pendingPlan,
      plans,
      users: users.map((u) => ({
        id: String(u._id),
        name: u.name,
        email: u.email,
        role: u.role,
      })),
    };
  }

  /** Subir: cobra la diferencia prorrateada; el plan cambia al aprobarse (C1). */
  async upgrade(tenantId: string, userId: string, plan: PlanId) {
    const { t, sub } = await this.paidTenant(tenantId);
    if (!SELF_SERVE.includes(plan) || PLAN_RANK[plan] <= PLAN_RANK[t.plan])
      throw new BadRequestException(
        'Ese plan no es una subida desde tu plan actual',
      );
    if (sub.cancelAtPeriodEnd)
      throw new BadRequestException('Reactiva tu plan antes de cambiarlo');
    const newPrice = agreedPrice(t, plan, sub.period!, sub.currency!);
    const amount = prorate({
      oldAmount: sub.amount ?? 0,
      newAmount: newPrice,
      period: sub.period!,
      periodEnd: sub.currentPeriodEnd!,
    });
    if (amount < 1) {
      // Prácticamente sin periodo por delante: el cambio entra sin cobro.
      await this.applyUpgrade(t._id, plan);
      return { applied: true as const };
    }
    const billing = t.billingInfo;
    if (!billing?.docNumber || !billing.legalName)
      throw new BadRequestException(
        'Completa tus datos de facturación antes de cambiar de plan',
      );
    const admin = await this.users.findById(userId).lean().exec();
    return this.checkout.createUpgrade({
      tenantId: String(t._id),
      userId,
      upgradeFrom: t.plan,
      quotedPeriodEnd: sub.currentPeriodEnd!,
      plan,
      period: sub.period!,
      currency: sub.currency!,
      amount,
      buyer: {
        company: t.name,
        name: admin?.name || t.name,
        email: admin?.email ?? t.email,
      },
      billing: billing,
    });
  }

  /**
   * Subida pagada por checkout: solo se aplica si la cuenta sigue en el plan
   * y el periodo con que se calculó la diferencia. Si no (otra subida, una
   * renovación en medio), no se toca el plan y se avisa al superadmin para
   * reembolsar: nunca se baja de plan ni se aplica un monto viejo.
   */
  async applyPaidUpgrade(
    tenantId: Types.ObjectId | string,
    s: {
      plan: PlanId;
      publicId: string;
      upgradeFrom?: string;
      quotedPeriodEnd?: Date;
      total: number;
      currency: string;
    },
  ): Promise<boolean> {
    const t = await this.tenants.findById(tenantId).lean().exec();
    const sub = t?.subscription;
    const samePeriod =
      !s.quotedPeriodEnd ||
      (sub?.currentPeriodEnd &&
        new Date(sub.currentPeriodEnd).getTime() ===
          new Date(s.quotedPeriodEnd).getTime());
    const ok =
      !!t &&
      sub?.status === 'active' &&
      (!s.upgradeFrom || t.plan === s.upgradeFrom) &&
      samePeriod &&
      PLAN_RANK[s.plan] > PLAN_RANK[t.plan];
    if (ok) {
      await this.applyUpgrade(t._id, s.plan);
      return true;
    }
    this.logger.warn(
      `Subida ${s.publicId} pagada pero ya no aplica: revisar reembolso`,
    );
    const admins = (
      await this.users
        .find({ role: 'SUPERADMIN', isActive: { $ne: false } })
        .select('email')
        .lean()
        .exec()
    ).map((u) => u.email);
    await this.mailer.trySend({
      key: `upgrade_stale:${s.publicId}`,
      type: 'upgrade_stale',
      to: admins,
      tenantId,
      content: T.upgradeStale({
        tenant: t?.name ?? String(tenantId),
        reference: s.publicId,
        amount: s.total,
        currency: s.currency,
        url: this.mailer.frontendUrl('/admin/tenants'),
      }),
    });
    return false;
  }

  /**
   * Aplica una subida pagada: plan y precio nuevos con el mismo fin de
   * periodo; en mensual, el `preapproval` cobra el monto nuevo desde el
   * siguiente ciclo.
   */
  async applyUpgrade(tenantId: Types.ObjectId | string, plan: PlanId) {
    const t = await this.tenants.findById(tenantId).exec();
    const sub = t?.subscription;
    if (!t || !sub?.period || !sub.currency) return;
    // El precio pactado incluye los add-ons mensuales contratados (HU53).
    const price = agreedPrice(t, plan, sub.period, sub.currency);
    const monthly = sub.period === 'monthly' && !!sub.mpPreapprovalId;
    await this.tenants
      .updateOne(
        { _id: t._id },
        {
          $set: {
            plan,
            'subscription.amount': price,
            ...(monthly
              ? {
                  'subscription.preapprovalAmountTarget':
                    sub.currency === 'PEN' ? withIgv(price) : price,
                }
              : {}),
          },
          $unset: {
            'subscription.pendingPlan': '',
            'subscription.pendingKeepUsers': '',
          },
        },
      )
      .exec();
    this.access.invalidate(String(t._id));
    await this.settleUsers(t._id);
    if (monthly) await this.syncPreapprovalAmounts();
    await this.mailer.trySend({
      key: `plan_change:${String(t._id)}:up:${plan}:${sub.currentPeriodEnd?.toISOString()}`,
      type: 'plan_change',
      to: await this.mailer.recipients(t._id),
      tenantId: t._id,
      content: T.planChange({
        what: `Tu plan ahora es ${PLANS[plan].name}, con sus límites y funciones,`,
        from: new Date(),
        accountUrl: this.mailer.frontendUrl('/settings/plan'),
      }),
    });
  }

  /**
   * Bajar: entra al fin del periodo. Si hay más usuarios activos que el
   * límite nuevo, hay que elegir cuáles conservar (C3).
   */
  async downgrade(tenantId: string, plan: PlanId, keepUserIds?: string[]) {
    const { t, sub } = await this.paidTenant(tenantId);
    if (!SELF_SERVE.includes(plan) || PLAN_RANK[plan] >= PLAN_RANK[t.plan])
      throw new BadRequestException(
        'Ese plan no es una bajada desde tu plan actual',
      );
    if (sub.cancelAtPeriodEnd)
      throw new BadRequestException('Reactiva tu plan antes de cambiarlo');
    const excess = await this.excessFor(tenantId, plan);
    const users = excess.find((e) => e.key === 'users');
    let keep: string[] | undefined;
    if (users) {
      const active = await this.activeUserIds(t._id);
      keep = [...new Set(keepUserIds ?? [])].filter((id) =>
        active.includes(id),
      );
      if (keep.length !== users.limit)
        throw new ConflictException({
          code: 'CHOOSE_USERS',
          message: `El plan ${PLANS[plan].name} permite ${users.limit} usuarios activos: elige cuáles conservar.`,
          limit: users.limit,
          excess,
        });
      // El administrador que hace el cambio no puede quedarse fuera.
      const admins = await this.users
        .find({
          _id: { $in: keep.map((id) => new Types.ObjectId(id)) },
          role: 'TENANT_ADMIN',
        })
        .countDocuments()
        .exec();
      if (!admins)
        throw new BadRequestException('Conserva al menos un administrador');
    }
    const price = agreedPrice(t, plan, sub.period!, sub.currency!);
    const monthly = sub.period === 'monthly' && !!sub.mpPreapprovalId;
    await this.tenants
      .updateOne(
        { _id: t._id },
        {
          $set: {
            'subscription.pendingPlan': plan,
            ...(keep ? { 'subscription.pendingKeepUsers': keep } : {}),
            ...(monthly
              ? {
                  'subscription.preapprovalAmountTarget':
                    sub.currency === 'PEN' ? withIgv(price) : price,
                }
              : {}),
          },
          ...(keep ? {} : { $unset: { 'subscription.pendingKeepUsers': '' } }),
        },
      )
      .exec();
    if (monthly) await this.syncPreapprovalAmounts();
    await this.mailer.trySend({
      key: `plan_change:${String(t._id)}:down:${plan}:${sub.currentPeriodEnd!.toISOString()}`,
      type: 'plan_change',
      to: await this.mailer.recipients(t._id),
      tenantId: t._id,
      content: T.planChange({
        what: `Pasas al plan ${PLANS[plan].name}${excess.length ? '; lo que supere sus límites sigue funcionando, pero no podrás añadir más hasta bajar de ese número' : ''}`,
        from: sub.currentPeriodEnd!,
        accountUrl: this.mailer.frontendUrl('/settings/plan'),
      }),
    });
    return { pendingPlan: plan, from: sub.currentPeriodEnd, excess };
  }

  /** Deshace una bajada programada. */
  async cancelDowngrade(tenantId: string) {
    const { t, sub } = await this.paidTenant(tenantId);
    if (!sub.pendingPlan) return { ok: true };
    const monthly = sub.period === 'monthly' && !!sub.mpPreapprovalId;
    await this.tenants
      .updateOne(
        { _id: t._id },
        {
          $unset: {
            'subscription.pendingPlan': '',
            'subscription.pendingKeepUsers': '',
          },
          ...(monthly
            ? {
                $set: {
                  'subscription.preapprovalAmountTarget':
                    sub.currency === 'PEN'
                      ? withIgv(sub.amount ?? 0)
                      : (sub.amount ?? 0),
                },
              }
            : {}),
        },
      )
      .exec();
    if (monthly) await this.syncPreapprovalAmounts();
    return { ok: true };
  }

  /** Cancelar: sigue activa hasta el fin del periodo; en mensual deja de cobrar ya (C2). */
  async cancel(tenantId: string, reason?: string) {
    const { t, sub } = await this.paidTenant(tenantId, true);
    // Primero se detiene el cobro en Mercado Pago (se pausa, para poder
    // reactivar sin pagar de nuevo): si falla, no se marca nada y el cliente
    // puede reintentar. Repetir la llamada vuelve a pausar (idempotente).
    if (sub.mpPreapprovalId)
      await this.mp
        .updatePreapproval(sub.mpPreapprovalId, { status: 'paused' })
        .catch((err) => {
          this.logger.error(`Pausar ${sub.mpPreapprovalId}: ${String(err)}`);
          throw new ServiceUnavailableException(
            'No pudimos detener el cobro en Mercado Pago. Inténtalo de nuevo en un momento.',
          );
        });
    if (sub.cancelAtPeriodEnd)
      return { cancelAtPeriodEnd: true, until: sub.currentPeriodEnd };
    const why = reason?.trim()
      ? { 'subscription.cancelReason': reason.trim().slice(0, 500) }
      : {};
    // En impago (HU51) no hay periodo pagado por delante: se cierra ya.
    const pastDue = sub.status === 'past_due';
    await this.tenants
      .updateOne(
        { _id: t._id },
        pastDue
          ? {
              $set: {
                'subscription.status': 'canceled',
                'subscription.canceledAt': new Date(),
                ...why,
              },
              ...(sub.mpPreapprovalId
                ? {
                    $addToSet: {
                      'subscription.preapprovalsToCancel': sub.mpPreapprovalId,
                    },
                  }
                : {}),
            }
          : {
              $set: {
                'subscription.cancelAtPeriodEnd': true,
                'subscription.canceledAt': new Date(),
                ...why,
              },
            },
      )
      .exec();
    this.access.invalidate(String(t._id));
    await this.mailer.trySend({
      key: `plan_change:${String(t._id)}:cancel:${sub.currentPeriodEnd!.toISOString()}`,
      type: 'plan_change',
      to: await this.mailer.recipients(t._id),
      tenantId: t._id,
      content: T.planChange({
        what: pastDue
          ? 'No se te cobrará más. Tu cuenta queda en solo lectura (tus datos no se borran)'
          : 'No se te cobrará más. Tu cuenta sigue funcionando hasta el fin del periodo pagado y luego queda en solo lectura (tus datos no se borran),',
        from: pastDue ? new Date() : sub.currentPeriodEnd!,
        accountUrl: this.mailer.frontendUrl('/settings/plan'),
        canceled: true,
      }),
    });
    return {
      cancelAtPeriodEnd: !pastDue,
      until: pastDue ? new Date() : sub.currentPeriodEnd,
    };
  }

  /** Reactivar antes del fin del periodo deshace la cancelación. */
  async reactivate(tenantId: string) {
    const { t, sub } = await this.paidTenant(tenantId);
    if (!sub.cancelAtPeriodEnd) return { cancelAtPeriodEnd: false };
    if (sub.mpPreapprovalId)
      await this.mp
        .updatePreapproval(sub.mpPreapprovalId, { status: 'authorized' })
        .catch(async (err) => {
          this.logger.warn(`Reanudar ${sub.mpPreapprovalId}: ${String(err)}`);
          // Cancelada desde Mercado Pago (HU78): no se puede reanudar.
          const pre = await this.mp
            .getPreapproval(sub.mpPreapprovalId!)
            .catch(() => null);
          if (pre?.status === 'cancelled')
            throw new BadRequestException(
              'Tu suscripción se canceló en Mercado Pago. Vuelve a elegir tu plan para reactivarla.',
            );
          throw new ServiceUnavailableException(
            'No pudimos reanudar el cobro en Mercado Pago. Inténtalo de nuevo en un momento.',
          );
        });
    await this.tenants
      .updateOne(
        { _id: t._id },
        {
          $set: { 'subscription.cancelAtPeriodEnd': false },
          $unset: {
            'subscription.canceledAt': '',
            'subscription.cancelReason': '',
          },
        },
      )
      .exec();
    this.access.invalidate(String(t._id));
    return { cancelAtPeriodEnd: false };
  }

  /** Planes cancelados cuyo periodo terminó → `canceled` (solo lectura, HU51). */
  @Cron(CronExpression.EVERY_HOUR)
  async endCanceled(now = new Date()): Promise<number> {
    const list = await this.tenants
      .find({
        'subscription.status': 'active',
        'subscription.cancelAtPeriodEnd': true,
        'subscription.currentPeriodEnd': { $lt: now },
      })
      .select('_id subscription.mpPreapprovalId')
      .limit(500)
      .lean()
      .exec();
    for (const t of list) {
      await this.tenants
        .updateOne(
          {
            _id: t._id,
            'subscription.status': 'active',
            'subscription.cancelAtPeriodEnd': true,
          },
          {
            $set: { 'subscription.status': 'canceled' },
            ...(t.subscription?.mpPreapprovalId
              ? {
                  $addToSet: {
                    'subscription.preapprovalsToCancel':
                      t.subscription.mpPreapprovalId,
                  },
                }
              : {}),
          },
        )
        .exec();
      this.access.invalidate(String(t._id));
    }
    return list.length;
  }

  /** Bajadas ya pagadas (renovación de pago único) que entran hoy. */
  @Cron(CronExpression.EVERY_HOUR)
  async applyScheduled(now = new Date()): Promise<number> {
    const list = await this.tenants
      .find({ 'subscription.pendingPlanFrom': { $lte: now } })
      .select('_id')
      .limit(500)
      .lean()
      .exec();
    let n = 0;
    for (const t of list) {
      if (await this.applyPending(t._id)) n++;
      await this.tenants
        .updateOne(
          { _id: t._id },
          { $unset: { 'subscription.pendingPlanFrom': '' } },
        )
        .exec();
    }
    return n;
  }

  /** Lleva a Mercado Pago el monto mensual nuevo; si falla, reintenta luego. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async syncPreapprovalAmounts(): Promise<number> {
    const list = await this.tenants
      .find({ 'subscription.preapprovalAmountTarget': { $exists: true } })
      .select(
        '_id subscription.mpPreapprovalId subscription.preapprovalAmountTarget subscription.currency',
      )
      .limit(100)
      .lean()
      .exec();
    let n = 0;
    for (const t of list) {
      const sub = t.subscription!;
      try {
        if (sub.mpPreapprovalId)
          await this.mp.updatePreapproval(sub.mpPreapprovalId, {
            auto_recurring: {
              transaction_amount: sub.preapprovalAmountTarget,
              currency_id: sub.currency,
            },
          });
        await this.tenants
          .updateOne(
            {
              _id: t._id,
              'subscription.preapprovalAmountTarget':
                sub.preapprovalAmountTarget,
            },
            { $unset: { 'subscription.preapprovalAmountTarget': '' } },
          )
          .exec();
        n++;
      } catch (err) {
        this.logger.error(
          `Monto del preapproval ${sub.mpPreapprovalId}: ${String(err)}`,
        );
      }
    }
    return n;
  }

  /**
   * Al renovar (cobro mensual o pago del periodo) entra la bajada programada.
   * Devuelve true si cambió el plan.
   */
  async applyPending(tenantId: Types.ObjectId | string): Promise<boolean> {
    const t = await this.tenants.findById(tenantId).lean().exec();
    const sub = t?.subscription;
    if (!t || !sub?.pendingPlan || !sub.period || !sub.currency) return false;
    const plan = sub.pendingPlan;
    const res = await this.tenants
      .updateOne(
        { _id: t._id, 'subscription.pendingPlan': plan },
        {
          $set: {
            plan,
            'subscription.amount': agreedPrice(
              t,
              plan,
              sub.period,
              sub.currency,
            ),
          },
          $unset: { 'subscription.pendingPlan': '' },
        },
      )
      .exec();
    this.access.invalidate(String(t._id));
    if (res.modifiedCount === 1) await this.settleUsers(t._id);
    return res.modifiedCount === 1;
  }

  private async activeUserIds(tenantId: Types.ObjectId): Promise<string[]> {
    return (
      await this.users
        .find({
          tenantId,
          role: { $ne: 'SUPERADMIN' },
          isActive: { $ne: false },
        })
        .select('_id')
        .lean()
        .exec()
    ).map((u) => String(u._id));
  }

  /**
   * Ajusta los usuarios activos al límite del plan: desactiva (sin borrar)
   * los que no se eligieron conservar, o reactiva los que se desactivaron
   * por plan si ahora hay lugar.
   */
  async settleUsers(tenantId: Types.ObjectId | string): Promise<void> {
    const tid = new Types.ObjectId(String(tenantId));
    const t = await this.tenants.findById(tid).lean().exec();
    if (!t) return;
    const eff = await this.limits.effective(String(tid));
    const limit = eff.unlimited ? null : eff.limits.users;
    const active = await this.users
      .find({
        tenantId: tid,
        role: { $ne: 'SUPERADMIN' },
        isActive: { $ne: false },
      })
      .select('_id role createdAt')
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    const keep = new Set(t.subscription?.pendingKeepUsers ?? []);
    if (limit != null && active.length > limit) {
      // Primero los elegidos, luego administradores, luego los más antiguos.
      const ordered = [...active].sort(
        (a, b) =>
          Number(keep.has(String(b._id))) - Number(keep.has(String(a._id))) ||
          Number(b.role === 'TENANT_ADMIN') - Number(a.role === 'TENANT_ADMIN'),
      );
      const off = ordered.slice(limit).map((u) => u._id);
      await this.users
        .updateMany(
          { _id: { $in: off } },
          { $set: { isActive: false, deactivatedByPlan: true } },
        )
        .exec();
    } else {
      const room = limit == null ? Infinity : limit - active.length;
      if (room > 0) {
        const back = await this.users
          .find({ tenantId: tid, deactivatedByPlan: true, isActive: false })
          .sort({ createdAt: 1 })
          .limit(room === Infinity ? 1000 : room)
          .select('_id')
          .lean()
          .exec();
        if (back.length)
          await this.users
            .updateMany(
              { _id: { $in: back.map((u) => u._id) } },
              { $set: { isActive: true }, $unset: { deactivatedByPlan: '' } },
            )
            .exec();
      }
    }
    await this.tenants
      .updateOne(
        { _id: tid },
        { $unset: { 'subscription.pendingKeepUsers': '' } },
      )
      .exec();
  }
}
