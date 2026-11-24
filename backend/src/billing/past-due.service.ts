import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { Tenant } from '../tenants/tenant.schema';
import { User } from '../users/user.schema';
import { PLANS } from './plans.catalog';
import { BillingMailer } from './emails/billing-mailer.service';
import { T } from './emails/billing-email.templates';

const DAY_MS = 24 * 3600_000;
/** Días tras el cobro fallido en los que se avisa al cliente (HU51). */
export const PAST_DUE_NOTICE_DAYS = [0, 3, 6];
/** Días en solo lectura tras los que se avisa al superadmin (HU51 §4). */
export const LONG_EXPIRED_DAYS = 60;

/**
 * Cobro fallido (HU51): avisos al cliente los días 0, 3 y 6 de la gracia y
 * aviso al superadmin cuando una cuenta lleva 60 días en solo lectura. Los
 * datos nunca se borran solos.
 */
@Injectable()
export class PastDueService {
  constructor(
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
    @InjectModel(User.name) private users: Model<User>,
    private mailer: BillingMailer,
  ) {}

  /** Aviso del día `day` de la gracia; la clave evita repetirlo. */
  async notify(
    tenantId: Types.ObjectId,
    day: number,
    reason?: string,
  ): Promise<boolean> {
    const t = await this.tenants.findById(tenantId).lean().exec();
    const sub = t?.subscription;
    if (!t || sub?.status !== 'past_due' || !sub.pastDueSince) return false;
    const params = new URLSearchParams({
      plan: t.plan,
      periodo: { monthly: 'mensual', quarterly: 'trimestral', annual: 'anual' }[
        sub.period ?? 'monthly'
      ],
      ...(sub.currency ? { moneda: sub.currency } : {}),
    });
    return this.mailer.trySend({
      key: `past_due:${String(t._id)}:${sub.pastDueSince.toISOString()}:${day}`,
      type: 'past_due',
      to: await this.mailer.recipients(t._id),
      tenantId: t._id,
      content: T.monthlyFailed({
        planName: PLANS[t.plan]?.name ?? t.plan,
        period: sub.period,
        amount: sub.amount ?? 0,
        currency: sub.currency ?? 'PEN',
        reason:
          reason ??
          (sub.period === 'monthly'
            ? 'El cobro automático de tu plan no se aprobó.'
            : 'Tu plan venció sin renovarse.'),
        graceEndsAt: sub.graceEndsAt,
        updateUrl: this.mailer.frontendUrl(`/checkout?${params.toString()}`),
      }),
    });
  }

  /** Recordatorios de los días 3 y 6 (el 0 sale al fallar el cobro). */
  @Cron(CronExpression.EVERY_HOUR)
  async reminders(now = new Date()): Promise<number> {
    const list = await this.tenants
      .find({
        'subscription.status': 'past_due',
        'subscription.pastDueSince': { $exists: true },
        'subscription.graceEndsAt': { $gt: now },
      })
      .select('_id subscription.pastDueSince')
      .limit(500)
      .lean()
      .exec();
    let sent = 0;
    for (const t of list) {
      const day = Math.floor(
        (now.getTime() - t.subscription!.pastDueSince!.getTime()) / DAY_MS,
      );
      // El último aviso que toca a esta altura (si el cron se saltó una hora, igual sale).
      const due = [...PAST_DUE_NOTICE_DAYS].reverse().find((d) => d <= day);
      if (due === undefined) continue;
      if (await this.notify(t._id, due)) sent++;
    }
    return sent;
  }

  /** A los 60 días en solo lectura, aviso a los superadmin (una vez). */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async longExpired(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - LONG_EXPIRED_DAYS * DAY_MS);
    // Cuentas que pagaron alguna vez: impago con la gracia vencida o plan
    // cancelado ya terminado. Las pruebas que nunca pagaron no se avisan.
    const list = await this.tenants
      .find({
        'subscription.longExpiredNoticeAt': { $exists: false },
        $or: [
          {
            'subscription.status': 'past_due',
            'subscription.graceEndsAt': { $lt: cutoff },
          },
          {
            'subscription.status': 'canceled',
            'subscription.currentPeriodEnd': { $lt: cutoff },
          },
        ],
      })
      .select('_id name email subscription')
      .limit(200)
      .lean()
      .exec();
    if (!list.length) return 0;
    const admins = (
      await this.users
        .find({ role: 'SUPERADMIN', isActive: { $ne: false } })
        .select('email')
        .lean()
        .exec()
    ).map((u) => u.email);
    let sent = 0;
    for (const t of list) {
      const since =
        t.subscription!.status === 'past_due'
          ? t.subscription!.graceEndsAt!
          : t.subscription!.currentPeriodEnd!;
      const ok = await this.mailer.trySend({
        key: `long_expired:${String(t._id)}:${since.toISOString()}`,
        type: 'long_expired',
        to: admins,
        tenantId: t._id,
        content: T.longExpired({
          tenant: t.name,
          email: t.email,
          since,
          url: this.mailer.frontendUrl('/admin/tenants'),
        }),
      });
      // Marcada aunque ya hubiera salido: no vuelve a ocupar el lote.
      if (
        ok ||
        (await this.mailer.wasSent(
          `long_expired:${String(t._id)}:${since.toISOString()}`,
        ))
      )
        await this.tenants
          .updateOne(
            { _id: t._id },
            { $set: { 'subscription.longExpiredNoticeAt': now } },
          )
          .exec();
      if (ok) sent++;
    }
    return sent;
  }
}
