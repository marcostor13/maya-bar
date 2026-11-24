import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Tenant } from '../tenants/tenant.schema';
import { User } from '../users/user.schema';
import {
  ADDONS,
  ADDON_IDS,
  TOPUP_MONTHS,
  addonsCost,
  type AddonId,
} from './addons.catalog';
import {
  addMonths,
  isPlanId,
  prorate,
  withIgv,
  type Currency,
} from './plans.catalog';
import { BillingAccessService } from './billing-access.service';
import { CheckoutService } from './checkout.service';
import { PlanChangeService } from './plan-change.service';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Add-ons mensuales y recargas (HU53). Se compran en un paso desde Mi plan o
 * desde el aviso de límite; cada compra es un pago único con su comprobante.
 */
@Injectable()
export class AddonsService {
  private readonly logger = new Logger(AddonsService.name);

  constructor(
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
    @InjectModel(User.name) private users: Model<User>,
    private checkout: CheckoutService,
    private planChange: PlanChangeService,
    private access: BillingAccessService,
  ) {}

  private currencyOf(t: Tenant): Currency {
    return t.subscription?.currency ?? 'PEN';
  }

  /** Lo que se cobra hoy (sin IGV) por `qty` unidades del add-on. */
  quote(t: Tenant, id: AddonId, qty: number, now = new Date()): number {
    const a = ADDONS[id];
    const cur = this.currencyOf(t);
    if (a.kind === 'topup') return round2(a.price[cur] * qty);
    const sub = t.subscription!;
    // Mensual: hasta el fin del periodo vigente, prorrateado.
    const perPeriod = addonsCost({ [id]: qty }, sub.period!, cur);
    return prorate({
      oldAmount: 0,
      newAmount: perPeriod,
      period: sub.period!,
      periodEnd: sub.currentPeriodEnd!,
      now,
    });
  }

  private paidSubscription(t: Tenant) {
    const sub = t.subscription;
    return (
      sub?.status === 'active' &&
      !!sub.period &&
      !!sub.currency &&
      !!sub.currentPeriodEnd &&
      !sub.cancelAtPeriodEnd
    );
  }

  /** Catálogo con precio en la moneda de la cuenta, lo de hoy y lo contratado. */
  async list(tenantId: string) {
    const t = await this.tenants.findById(tenantId).exec();
    if (!t) throw new BadRequestException('Sin empresa');
    const cur = this.currencyOf(t);
    const paid = this.paidSubscription(t);
    return {
      currency: cur,
      paid,
      aiCreditsPurchased: t.aiCreditsPurchased ?? 0,
      aiCreditsPurchasedExpiresAt: t.aiCreditsPurchasedExpiresAt,
      campaignEmailsPurchased: t.campaignEmailsPurchased ?? 0,
      campaignEmailsPurchasedExpiresAt: t.campaignEmailsPurchasedExpiresAt,
      addons: ADDON_IDS.map((id) => {
        const a = ADDONS[id];
        const available = a.kind === 'topup' || paid;
        const due = available ? this.quote(t, id, 1) : null;
        return {
          id,
          name: a.name,
          kind: a.kind,
          limit: a.limit,
          price: a.price[cur],
          owned: t.addonItems?.[id] ?? 0,
          available,
          dueNow: due,
          dueNowWithIgv:
            due == null ? null : cur === 'PEN' ? withIgv(due) : due,
        };
      }),
    };
  }

  /** Compra: abre el pago (o aplica directo si el prorrateo es menor a 1). */
  async buy(tenantId: string, userId: string, id: AddonId, qty = 1) {
    const t = await this.tenants.findById(tenantId).exec();
    if (!t) throw new BadRequestException('Sin empresa');
    const a = ADDONS[id];
    if (a.kind === 'monthly' && !this.paidSubscription(t))
      throw new BadRequestException(
        'Los extras mensuales se suman a un plan pagado: elige un plan primero.',
      );
    const amount = this.quote(t, id, qty);
    if (a.kind === 'monthly' && amount < 1) {
      await this.apply(
        t._id,
        id,
        qty,
        `free:${String(t._id)}:${id}:${t.subscription!.currentPeriodEnd!.toISOString()}:${t.addonItems?.[id] ?? 0}`,
      );
      return { applied: true as const };
    }
    const billing = t.billingInfo;
    if (!billing?.docNumber || !billing.legalName)
      throw new BadRequestException(
        'Completa tus datos de facturación antes de comprar',
      );
    const admin = await this.users.findById(userId).lean().exec();
    return this.checkout.createAddon({
      tenantId: String(t._id),
      userId,
      plan: isPlanId(t.plan) ? t.plan : 'inicia',
      period: t.subscription?.period ?? 'monthly',
      currency: this.currencyOf(t),
      amount,
      addonId: id,
      addonQty: qty,
      title: qty > 1 ? `${a.name} × ${qty}` : a.name,
      buyer: {
        company: t.name,
        name: admin?.name || t.name,
        email: admin?.email ?? t.email,
      },
      billing: billing,
    });
  }

  /**
   * Aplica un add-on pagado. Idempotente por compra (`purchaseId` queda en
   * `appliedPurchases` en el mismo update) y atómico: todo con `$inc`, así dos
   * compras a la vez suman las dos. Devuelve false si ya se había aplicado o si
   * la cuenta ya no tiene un plan al que sumarlo (se avisa para reembolsar).
   */
  async apply(
    tenantId: Types.ObjectId | string,
    id: AddonId,
    qty: number,
    purchaseId?: string,
    now = new Date(),
  ): Promise<boolean> {
    const a = ADDONS[id];
    const _id = new Types.ObjectId(String(tenantId));
    const once = purchaseId ? { appliedPurchases: { $ne: purchaseId } } : {};
    const mark = purchaseId
      ? { $push: { appliedPurchases: { $each: [purchaseId], $slice: -500 } } }
      : {};
    if (a.kind === 'topup') {
      const field =
        a.balance === 'aiCredits'
          ? 'aiCreditsPurchased'
          : 'campaignEmailsPurchased';
      const expField = `${field}ExpiresAt`;
      // Una recarga vencida no se suma: primero se pone en cero (condicional).
      await this.tenants
        .updateOne(
          { _id, ...once, [expField]: { $lte: now } },
          { $set: { [field]: 0 } },
        )
        .exec();
      const res = await this.tenants
        .updateOne(
          { _id, ...once },
          {
            $inc: { [field]: a.amount * qty },
            $set: { [expField]: addMonths(now, TOPUP_MONTHS) },
            ...mark,
          },
        )
        .exec();
      return res.modifiedCount === 1;
    }
    const t = await this.tenants.findById(_id).lean().exec();
    const sub = t?.subscription;
    if (
      !t ||
      !sub?.period ||
      !sub.currency ||
      !['active', 'past_due'].includes(sub.status ?? '')
    ) {
      this.logger.warn(
        `Add-on ${id} pagado (${purchaseId}) sin plan activo: revisar reembolso`,
      );
      return false;
    }
    const cur = sub.currency;
    const cost = addonsCost({ [id]: qty }, sub.period, cur);
    const monthly = sub.period === 'monthly' && !!sub.mpPreapprovalId;
    const res = await this.tenants
      .updateOne(
        { _id, ...once, 'subscription.period': sub.period },
        {
          $inc: {
            [`addonItems.${id}`]: qty,
            // Lo que se vende es el total de unidades del recurso.
            [`addons.${a.limit!}`]: a.amount * qty,
            // Sobre el precio pactado (puede tener descuento): solo se suma el add-on.
            'subscription.amount': cost,
          },
          ...mark,
        },
      )
      .exec();
    if (res.modifiedCount !== 1) return false;
    if (monthly) {
      const after = await this.tenants
        .findById(_id)
        .select('subscription.amount')
        .lean()
        .exec();
      const amount = round2(after?.subscription?.amount ?? 0);
      await this.tenants
        .updateOne(
          { _id },
          {
            $set: {
              'subscription.amount': amount,
              'subscription.preapprovalAmountTarget':
                cur === 'PEN' ? withIgv(amount) : amount,
            },
          },
        )
        .exec();
    }
    this.access.invalidate(String(_id));
    // Si había usuarios desactivados por plan, el cupo nuevo los reactiva.
    if (a.limit === 'users') await this.planChange.settleUsers(_id);
    if (monthly) await this.planChange.syncPreapprovalAmounts();
    return true;
  }
}
