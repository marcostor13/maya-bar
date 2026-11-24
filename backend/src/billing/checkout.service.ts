import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import {
  CheckoutSession,
  type CheckoutCoupon,
  type CheckoutSetup,
} from './checkout-session.schema';
import { isSetupId, setupQuote, type SetupId } from './setup.catalog';
import { Tenant } from '../tenants/tenant.schema';
import { ADDONS, addonsCost, isAddonId } from './addons.catalog';
import { CouponsService } from './coupons/coupons.service';
import type { Coupon } from './coupons/coupon.schema';
import { discountAmount } from './coupons/coupon-math';
import { CreateCheckoutDto, PERIOD_ALIASES } from './dto/checkout.dto';
import { docNumberError } from './dto/billing-info.dto';
import {
  IGV_RATE,
  PLANS,
  priceFor,
  type BillingPeriod,
  type Currency,
  type PlanId,
} from './plans.catalog';
import {
  MercadoPagoClient,
  MpPreapproval,
} from './mercadopago/mercadopago.client';
import { BillingHooks, PaymentChange } from './billing-hooks.service';
import { Payment } from './payment.schema';

const PERIOD_NAMES: Record<BillingPeriod, string> = {
  monthly: 'mensual',
  quarterly: 'trimestral',
  annual: 'anual',
};

export interface Quote {
  plan: PlanId;
  planName: string;
  period: BillingPeriod;
  currency: Currency;
  subtotal: number;
  igv: number;
  total: number;
  mode: 'subscription' | 'one_time';
  /** Con cupón (HU54): precio de lista y descuento, sin IGV. */
  listSubtotal?: number;
  discount?: number;
  /** Add-ons mensuales ya contratados que entran en el periodo (HU53), sin IGV. */
  addonsSubtotal?: number;
  /** Implementación (HU55): no está en subtotal/total, que son del plan. */
  setup?: CheckoutSetup;
  /** Lo que se paga hoy: plan + implementación (con IGV). */
  dueToday?: number;
  couponCode?: string;
  couponLabel?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Precio del periodo con IGV desglosado; el IGV solo aplica en soles (Perú). */
export function quoteFor(
  plan: PlanId,
  period: BillingPeriod,
  currency: Currency,
): Quote {
  const subtotal = priceFor(plan, period, currency);
  if (subtotal == null)
    throw new BadRequestException('Este plan se cotiza con ventas');
  const igv = currency === 'PEN' ? round2(subtotal * IGV_RATE) : 0;
  return {
    plan,
    planName: PLANS[plan].name,
    period,
    currency,
    subtotal,
    igv,
    total: round2(subtotal + igv),
    mode: period === 'monthly' ? 'subscription' : 'one_time',
  };
}

export interface CheckoutContext {
  tenantId?: string;
  userId?: string;
  kind?: 'plan' | 'upgrade' | 'addon';
  addonId?: string;
  addonQty?: number;
  /** Título del cobro en Mercado Pago (add-ons). */
  title?: string;
  upgradeFrom?: string;
  quotedPeriodEnd?: Date;
  coupon?: CheckoutCoupon;
  renewal?: boolean;
  /** Implementación contratada (HU55). */
  setupId?: SetupId;
  /** Id público ya elegido (para poder liberar el cupo si algo falla). */
  publicId?: string;
}

/** Vigencia del enlace de pago de una subida (HU52): luego hay que recalcular. */
export const UPGRADE_LINK_MS = 30 * 60_000;

/** Referencia del pago aparte de la implementación en mensual (HU55). */
export const SETUP_REF_SUFFIX = ':setup';

/**
 * Checkout de planes (HU46). Crea la sesión y la preferencia o suscripción
 * de Mercado Pago; el estado solo avanza por el webhook o la conciliación
 * (HU45), nunca por la URL de vuelta.
 */
export type PaidHandler = (session: CheckoutSession) => Promise<void>;

@Injectable()
export class CheckoutService implements OnModuleInit {
  private readonly logger = new Logger(CheckoutService.name);
  /** Alta de la cuenta tras el pago (HU47) y lo que venga después. */
  private paidHandlers: PaidHandler[] = [];

  constructor(
    @InjectModel(CheckoutSession.name) private sessions: Model<CheckoutSession>,
    private mp: MercadoPagoClient,
    private hooks: BillingHooks,
    private config: ConfigService,
    @Optional() private coupons?: CouponsService,
    @Optional() @InjectModel(Tenant.name) private tenants?: Model<Tenant>,
  ) {}

  /** Suma los add-ons mensuales de la cuenta al cobro del plan (HU53). */
  private async withAddons(q: Quote, tenantId?: string): Promise<Quote> {
    if (!tenantId || !this.tenants) return q;
    const t = await this.tenants
      .findById(tenantId)
      .select('addonItems')
      .lean()
      .exec();
    const extra = addonsCost(t?.addonItems, q.period, q.currency);
    if (!extra) return q;
    const subtotal = round2(q.subtotal + extra);
    const igv = q.currency === 'PEN' ? round2(subtotal * IGV_RATE) : 0;
    return {
      ...q,
      addonsSubtotal: extra,
      subtotal,
      igv,
      total: round2(subtotal + igv),
    };
  }

  /** Cotización para la cuenta: con cupón y con sus add-ons. */
  async quoteForAccount(
    tenantId: string,
    plan: string,
    period: string,
    currency: string,
    coupon?: string,
    setup?: string,
  ) {
    const q = await this.withAddons(
      await this.quoteWithCoupon(plan, period, currency, coupon),
      tenantId,
    );
    return isSetupId(setup) ? this.withSetup(q, setup) : q;
  }

  /**
   * Suma la implementación (HU55): en anual se descuenta hasta el 10 % del
   * precio de lista del año. No cambia el monto del plan (que se repite).
   */
  withSetup(q: Quote, id: SetupId): Quote {
    const planList = q.listSubtotal ?? q.subtotal - (q.addonsSubtotal ?? 0);
    const sq = setupQuote(id, q.period, q.currency, planList);
    const igv = q.currency === 'PEN' ? round2(sq.subtotal * IGV_RATE) : 0;
    const setup: CheckoutSetup = {
      ...sq,
      igv,
      total: round2(sq.subtotal + igv),
      ...(q.mode === 'subscription' ? { separate: true } : {}),
    };
    return { ...q, setup, dueToday: round2(q.total + setup.total) };
  }

  onModuleInit() {
    this.hooks.onPayment((e) => this.onPayment(e));
    this.hooks.onPreapproval((p) => this.onPreapproval(p));
  }

  /** Se avisa cuando una compra queda pagada; un fallo hace reintentar el evento. */
  onPaid(h: PaidHandler) {
    this.paidHandlers.push(h);
  }

  /**
   * Reclama el alta de forma atómica (HU47 C2): solo quien la obtiene la
   * trabaja; si el proceso muere, el candado vence a los 2 minutos.
   */
  claimProvisioning(publicId: string, now = new Date()) {
    return this.sessions
      .findOneAndUpdate(
        {
          publicId,
          status: 'paid',
          $or: [
            { provisioningUntil: { $exists: false } },
            { provisioningUntil: null },
            { provisioningUntil: { $lt: now } },
          ],
        },
        { $set: { provisioningUntil: new Date(now.getTime() + 2 * 60_000) } },
        { returnDocument: 'after' },
      )
      .exec();
  }

  /** Compras pagadas cuya alta quedó a medias (fallo o proceso caído). */
  findUnfulfilledPaid(now = new Date(), limit = 20) {
    return this.sessions
      .find({
        status: 'paid',
        $or: [
          { provisioningUntil: { $exists: false } },
          { provisioningUntil: null },
          { provisioningUntil: { $lt: now } },
        ],
      })
      .sort({ updatedAt: 1 })
      .limit(limit)
      .exec();
  }

  /** Anota un paso del alta ya hecho. */
  async saveProvision(
    id: Types.ObjectId,
    step: Record<string, unknown>,
  ): Promise<void> {
    const set = Object.fromEntries(
      Object.entries(step).map(([k, v]) => [`provision.${k}`, v]),
    );
    await this.sessions.updateOne({ _id: id }, { $set: set }).exec();
  }

  /** Suelta el candado tras un fallo para que el reintento entre enseguida. */
  async releaseProvisioning(id: Types.ObjectId): Promise<void> {
    await this.sessions
      .updateOne({ _id: id }, { $unset: { provisioningUntil: '' } })
      .exec();
  }

  /** La cuenta ya quedó activa: no se vuelve a dar de alta (HU47 C2). */
  async markFulfilled(id: Types.ObjectId, tenantId: Types.ObjectId) {
    await this.sessions
      .updateOne(
        { _id: id },
        {
          $set: { status: 'fulfilled', fulfilledAt: new Date(), tenantId },
          $unset: { provisioningUntil: '' },
        },
      )
      .exec();
  }

  quote(plan: string, period: string, currency: string): Quote {
    const p = PERIOD_ALIASES[period];
    if (
      !['inicia', 'crece', 'escala'].includes(plan) ||
      !p ||
      !['PEN', 'USD'].includes(currency)
    )
      throw new BadRequestException('Plan, periodo o moneda no válidos');
    return quoteFor(plan as PlanId, p, currency as Currency);
  }

  /** Aplica un cupón a una cotización (HU54): el IGV se calcula sobre el precio con descuento. */
  private withCoupon(
    q: Quote,
    c: Pick<Coupon, 'code' | 'type' | 'value' | 'label'>,
  ): Quote {
    const discount = discountAmount(c, q.subtotal);
    const subtotal = round2(q.subtotal - discount);
    const igv = q.currency === 'PEN' ? round2(subtotal * IGV_RATE) : 0;
    return {
      ...q,
      listSubtotal: q.subtotal,
      discount,
      subtotal,
      igv,
      total: round2(subtotal + igv),
      couponCode: c.code,
      couponLabel: c.label,
    };
  }

  /** Cotización con cupón opcional; si no aplica, 400 con el motivo. */
  async quoteWithCoupon(
    plan: string,
    period: string,
    currency: string,
    coupon?: string,
    setup?: string,
  ): Promise<Quote> {
    let q = this.quote(plan, period, currency);
    if (coupon?.trim() && this.coupons) {
      const c = await this.coupons.check(coupon, q.plan, q.period, q.currency);
      q = this.withCoupon(q, c);
    }
    return isSetupId(setup) ? this.withSetup(q, setup) : q;
  }

  private frontendUrl(): string {
    return (
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:4200'
    ).replace(/\/+$/, '');
  }

  private apiUrl(): string | undefined {
    return (
      (this.config.get<string>('PUBLIC_API_URL') || '').replace(/\/+$/, '') ||
      undefined
    );
  }

  async create(dto: CreateCheckoutDto, ctx: CheckoutContext = {}) {
    const billingError = docNumberError(dto.billing);
    if (billingError) throw new BadRequestException(billingError);
    if (!this.mp.configured())
      throw new BadRequestException(
        'El pago en línea aún no está disponible. Escríbenos y te ayudamos.',
      );

    // La implementación va con la primera compra, no con las renovaciones (HU55).
    if (dto.setup && !ctx.renewal) ctx = { ...ctx, setupId: dto.setup };
    let q = this.quote(dto.plan, dto.period, dto.currency);
    if (!dto.coupon?.trim() || !this.coupons)
      return this.open(
        await this.withAddons(q, ctx.tenantId),
        dto.buyer,
        dto.billing,
        ctx,
      );
    // El cupo se reserva al crear el checkout; si no se llega a abrir el pago, se libera.
    const c = await this.coupons.reserve(
      dto.coupon,
      q.plan,
      q.period,
      q.currency,
    );
    q = await this.withAddons(this.withCoupon(q, c), ctx.tenantId);
    const publicId = randomBytes(18).toString('base64url');
    try {
      return await this.open(q, dto.buyer, dto.billing, {
        ...ctx,
        publicId,
        coupon: {
          code: c.code,
          type: c.type,
          value: c.value,
          discount: q.discount!,
          listSubtotal: q.listSubtotal!,
          duration: c.duration,
          ...(c.durationMonths ? { durationMonths: c.durationMonths } : {}),
          ...(c.plans?.length ? { plans: c.plans } : {}),
          ...(c.periods?.length ? { periods: c.periods } : {}),
        },
      });
    } catch (err) {
      // Una sola liberación: marca la sesión (si quedó guardada) o libera directo.
      await this.coupons.releaseSession(publicId, c.code);
      throw err;
    }
  }

  /**
   * Renovación de un plan de pago único (HU48): mismo plan y periodo al
   * precio pactado (`subscription.amount`), no al del catálogo (C2).
   */
  async createRenewal(r: {
    tenantId: string;
    plan: PlanId;
    period: BillingPeriod;
    currency: Currency;
    amount: number;
    buyer: { company: string; name: string; email: string; phone?: string };
    billing: CreateCheckoutDto['billing'];
  }) {
    if (!this.mp.configured())
      throw new BadRequestException('Mercado Pago no está configurado');
    const igv = r.currency === 'PEN' ? round2(r.amount * IGV_RATE) : 0;
    const q: Quote = {
      plan: r.plan,
      planName: PLANS[r.plan].name,
      period: r.period,
      currency: r.currency,
      subtotal: r.amount,
      igv,
      total: round2(r.amount + igv),
      mode: 'one_time',
    };
    return this.open(q, r.buyer, r.billing, {
      tenantId: r.tenantId,
      renewal: true,
    });
  }

  /** Cobro único de un add-on o una recarga (HU53). */
  createAddon(r: {
    tenantId: string;
    userId: string;
    plan: PlanId;
    period: BillingPeriod;
    currency: Currency;
    amount: number;
    addonId: string;
    addonQty: number;
    title: string;
    buyer: CreateCheckoutDto['buyer'];
    billing: CreateCheckoutDto['billing'];
  }) {
    if (!this.mp.configured())
      throw new BadRequestException(
        'El pago en línea aún no está disponible. Escríbenos y te ayudamos.',
      );
    const igv = r.currency === 'PEN' ? round2(r.amount * IGV_RATE) : 0;
    const q: Quote = {
      plan: r.plan,
      planName: PLANS[r.plan].name,
      period: r.period,
      currency: r.currency,
      subtotal: r.amount,
      igv,
      total: round2(r.amount + igv),
      mode: 'one_time',
    };
    return this.open(q, r.buyer, r.billing, {
      tenantId: r.tenantId,
      userId: r.userId,
      kind: 'addon',
      addonId: r.addonId,
      addonQty: r.addonQty,
      title: r.title,
    });
  }

  /** Cobro único de la diferencia al subir de plan (HU52). */
  async createUpgrade(r: {
    tenantId: string;
    userId: string;
    upgradeFrom: string;
    quotedPeriodEnd: Date;
    plan: PlanId;
    period: BillingPeriod;
    currency: Currency;
    amount: number;
    buyer: CreateCheckoutDto['buyer'];
    billing: CreateCheckoutDto['billing'];
  }) {
    if (!this.mp.configured())
      throw new BadRequestException(
        'El pago en línea aún no está disponible. Escríbenos y te ayudamos.',
      );
    const igv = r.currency === 'PEN' ? round2(r.amount * IGV_RATE) : 0;
    const q: Quote = {
      plan: r.plan,
      planName: PLANS[r.plan].name,
      period: r.period,
      currency: r.currency,
      subtotal: r.amount,
      igv,
      total: round2(r.amount + igv),
      mode: 'one_time',
    };
    // Un solo pago de subida a la vez: evita pagar dos veces la diferencia.
    const open = await this.sessions
      .exists({
        tenantId: new Types.ObjectId(r.tenantId),
        kind: 'upgrade',
        status: { $in: ['awaiting_payment', 'pending', 'paid'] },
        createdAt: { $gt: new Date(Date.now() - UPGRADE_LINK_MS) },
      })
      .exec();
    if (open)
      throw new ConflictException(
        'Ya tienes un pago de cambio de plan en curso. Espera a que se confirme o inténtalo en 30 minutos.',
      );
    return this.open(q, r.buyer, r.billing, {
      tenantId: r.tenantId,
      userId: r.userId,
      kind: 'upgrade',
      upgradeFrom: r.upgradeFrom,
      quotedPeriodEnd: r.quotedPeriodEnd,
    });
  }

  private async open(
    q: Quote,
    buyer: CreateCheckoutDto['buyer'],
    billing: CreateCheckoutDto['billing'],
    ctx: CheckoutContext,
  ) {
    // La implementación (HU55) va siempre con su cálculo final sobre el plan.
    if (ctx.setupId && !q.setup) q = this.withSetup(q, ctx.setupId);
    const publicId = ctx.publicId ?? randomBytes(18).toString('base64url');
    const dto = { buyer, billing };
    const email = dto.buyer.email.trim().toLowerCase();
    const session = await this.sessions.create({
      publicId,
      plan: q.plan,
      period: q.period,
      currency: q.currency,
      subtotal: q.subtotal,
      igv: q.igv,
      total: q.total,
      mode: q.mode,
      buyer: {
        company: dto.buyer.company.trim(),
        name: dto.buyer.name.trim(),
        email,
        phone: dto.buyer.phone?.trim() || undefined,
      },
      billing: {
        docType: dto.billing.docType,
        docNumber: dto.billing.docNumber,
        legalName: dto.billing.legalName.trim(),
        address: dto.billing.address?.trim() || undefined,
        email: dto.billing.email?.trim().toLowerCase() || undefined,
      },
      ...(ctx.tenantId ? { tenantId: new Types.ObjectId(ctx.tenantId) } : {}),
      ...(ctx.userId ? { userId: new Types.ObjectId(ctx.userId) } : {}),
      kind: ctx.kind ?? 'plan',
      ...(ctx.upgradeFrom ? { upgradeFrom: ctx.upgradeFrom } : {}),
      ...(ctx.addonId
        ? { addonId: ctx.addonId, addonQty: ctx.addonQty ?? 1 }
        : {}),
      ...(ctx.quotedPeriodEnd ? { quotedPeriodEnd: ctx.quotedPeriodEnd } : {}),
      ...(ctx.coupon ? { coupon: ctx.coupon } : {}),
      ...(ctx.renewal ? { renewal: true } : {}),
      ...(q.setup ? { setup: q.setup } : {}),
    });

    const back = `${this.frontendUrl()}/checkout/resultado?session=${publicId}`;
    const title = ctx.title
      ? `Maya CRM · ${ctx.title}`
      : ctx.kind === 'upgrade'
        ? `Maya CRM · Cambio al plan ${q.planName} (diferencia del periodo)`
        : `Maya CRM · Plan ${q.planName} ${PERIOD_NAMES[q.period]}`;
    const metadata = {
      checkout_id: publicId,
      kind: ctx.kind ?? 'plan',
      plan: q.plan,
      period: q.period,
      ...(ctx.tenantId ? { tenant_id: ctx.tenantId } : {}),
    };
    const notificationUrl =
      this.apiUrl() && `${this.apiUrl()}/billing/webhooks/mercadopago`;

    try {
      if (q.mode === 'subscription') {
        const pre = await this.mp.createPreapproval(
          {
            reason: title,
            external_reference: publicId,
            payer_email: email,
            back_url: back,
            status: 'pending',
            auto_recurring: {
              frequency: 1,
              frequency_type: 'months',
              transaction_amount: q.total,
              currency_id: q.currency,
            },
          },
          `checkout-${publicId}`,
        );
        session.mpPreapprovalId = pre.id;
        session.redirectUrl = pre.init_point;
        // Mensual: la implementación es un pago único aparte (HU55), que se
        // ofrece en la pantalla de resultado y en el correo de bienvenida.
        if (q.setup) {
          const sp = await this.mp.createPreference(
            {
              items: [
                {
                  id: `setup-${q.setup.id}`,
                  title: `Maya CRM · ${q.setup.name}`,
                  quantity: 1,
                  unit_price: q.setup.total,
                  currency_id: q.currency,
                },
              ],
              payer: { email, name: dto.buyer.name.trim() },
              external_reference: `${publicId}${SETUP_REF_SUFFIX}`,
              metadata: { ...metadata, kind: 'setup', setup: q.setup.id },
              back_urls: { success: back, pending: back, failure: back },
              auto_return: 'approved',
              ...(notificationUrl ? { notification_url: notificationUrl } : {}),
              statement_descriptor: 'MAYA CRM',
            },
            `checkout-${publicId}-setup`,
          );
          session.setup = {
            ...q.setup,
            mpPreferenceId: sp.id,
            redirectUrl: sp.init_point,
          };
          session.markModified('setup');
        }
      } else {
        const pref = await this.mp.createPreference(
          {
            items: [
              {
                id: `${q.plan}-${q.period}`,
                title,
                quantity: 1,
                unit_price: q.total,
                currency_id: q.currency,
              },
              // Pago único: la implementación va en la misma preferencia (HU55).
              ...(q.setup
                ? [
                    {
                      id: `setup-${q.setup.id}`,
                      title: `Maya CRM · ${q.setup.name}`,
                      quantity: 1,
                      unit_price: q.setup.total,
                      currency_id: q.currency,
                    },
                  ]
                : []),
            ],
            payer: { email, name: dto.buyer.name.trim() },
            external_reference: publicId,
            metadata,
            back_urls: { success: back, pending: back, failure: back },
            auto_return: 'approved',
            // La diferencia vale para hoy: el enlace de una subida vence.
            ...(ctx.kind === 'upgrade' || ctx.kind === 'addon'
              ? {
                  expires: true,
                  expiration_date_to: new Date(
                    Date.now() + UPGRADE_LINK_MS,
                  ).toISOString(),
                }
              : {}),
            ...(notificationUrl ? { notification_url: notificationUrl } : {}),
            statement_descriptor: 'MAYA CRM',
          },
          `checkout-${publicId}`,
        );
        session.mpPreferenceId = pref.id;
        session.redirectUrl = pref.init_point;
      }
    } catch (err) {
      this.logger.error(
        `No se pudo crear el checkout ${publicId}: ${String(err)}`,
      );
      // Mensual con implementación: si falló la preferencia aparte, no dejar
      // la suscripción de MP creada y sin dueño.
      if (session.mpPreapprovalId)
        await this.mp
          .updatePreapproval(session.mpPreapprovalId, { status: 'cancelled' })
          .catch((e: unknown) =>
            this.logger.warn(
              `No se pudo cancelar el preapproval ${session.mpPreapprovalId}: ${String(e)}`,
            ),
          );
      await session.deleteOne();
      throw new BadRequestException(
        'Mercado Pago no respondió. Inténtalo de nuevo en un momento.',
      );
    }
    await session.save();
    return { session: publicId, redirectUrl: session.redirectUrl, ...q };
  }

  /** Estado para la pantalla de resultado (no expone datos personales). */
  async status(publicId: string) {
    const s = await this.sessions.findOne({ publicId }).lean().exec();
    if (!s) throw new NotFoundException('Compra no encontrada');
    return {
      status: s.status,
      plan: s.plan,
      planName: PLANS[s.plan].name,
      kind: s.kind ?? 'plan',
      ...(s.kind === 'addon' && isAddonId(s.addonId)
        ? { itemName: ADDONS[s.addonId].name }
        : {}),
      period: s.period,
      currency: s.currency,
      total: s.total,
      mode: s.mode,
      paymentMethod: s.paymentMethod,
      existingAccount: !!s.tenantId,
      // Implementación (HU55): en mensual se paga aparte después del plan.
      ...(s.setup
        ? {
            setup: {
              name: s.setup.name,
              total: s.setup.total,
              paid: !!s.setup.paidAt,
              // El enlace aparte se ofrece una vez pagado el plan.
              ...(s.setup.separate &&
              !s.setup.paidAt &&
              (s.status === 'paid' || s.status === 'fulfilled')
                ? { redirectUrl: s.setup.redirectUrl }
                : {}),
            },
          }
        : {}),
    };
  }

  /** Cambios de pago → estado de la sesión (HU45 webhook / conciliación). */
  private async onPayment({ payment }: PaymentChange) {
    const ref = payment.externalReference;
    if (ref?.endsWith(SETUP_REF_SUFFIX)) return this.onSetupPayment(payment);
    // Los cobros de una suscripción se enlazan por el id del preapproval.
    const filter = ref
      ? { publicId: ref }
      : payment.mpPreapprovalId
        ? { mpPreapprovalId: payment.mpPreapprovalId }
        : null;
    if (!filter) return;
    const session = await this.sessions.findOne(filter).exec();
    if (!session) return;
    // Pago único con implementación: queda pagada en el mismo cobro. Va antes
    // del alta para que un alta fallida (la retoma el cron) no pierda la tarea.
    const setupWithPlan =
      payment.status === 'approved' &&
      !!session.setup &&
      !session.setup.separate;
    if (session.status === 'fulfilled') {
      if (setupWithPlan)
        await this.markSetupPaid(session.publicId, payment.providerPaymentId);
      return;
    }
    session.paymentId = payment.providerPaymentId;
    session.paymentMethod = paymentMethodOf(payment);
    if (payment.status === 'approved') session.status = 'paid';
    // Un aviso viejo (pendiente) no hace retroceder una compra ya pagada.
    else if (payment.status === 'pending' && session.status !== 'paid')
      session.status = 'awaiting_payment';
    else if (payment.status === 'rejected' && session.status !== 'paid')
      session.status = 'rejected';
    await session.save();
    if (session.status === 'paid') {
      if (setupWithPlan)
        await this.markSetupPaid(session.publicId, payment.providerPaymentId);
      for (const h of this.paidHandlers) await h(session);
    }
  }

  /** Pago aparte de la implementación (mensual, HU55). */
  private async onSetupPayment(payment: Payment) {
    if (payment.status !== 'approved') return;
    const publicId = payment.externalReference!.slice(
      0,
      -SETUP_REF_SUFFIX.length,
    );
    const s = await this.sessions
      .findOne({ publicId })
      .select('setup currency')
      .lean()
      .exec();
    if (
      !s?.setup?.separate ||
      payment.currency !== s.currency ||
      Math.abs(payment.amount - s.setup.total) > 0.01
    ) {
      this.logger.warn(
        `Pago de implementación ${payment.providerPaymentId} no cuadra con ${publicId}: ${payment.amount} ${payment.currency}`,
      );
      return;
    }
    await this.markSetupPaid(publicId, payment.providerPaymentId);
  }

  /** Marca la implementación pagada una sola vez y avisa (tarea de onboarding). */
  private async markSetupPaid(publicId: string, paymentId?: string) {
    const s = await this.sessions
      .findOneAndUpdate(
        {
          publicId,
          setup: { $exists: true },
          'setup.paidAt': { $exists: false },
        },
        {
          $set: {
            'setup.paidAt': new Date(),
            ...(paymentId ? { 'setup.paymentId': paymentId } : {}),
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
    // Ya marcada: los avisos se reintentan igual (son idempotentes).
    const session =
      s ??
      (await this.sessions
        .findOne({ publicId, 'setup.paidAt': { $exists: true } })
        .exec());
    if (!session) return;
    for (const h of this.setupHandlers)
      await h(session).catch((e: unknown) =>
        this.logger.error(
          `Aviso de implementación pagada ${publicId} falló: ${String(e)}`,
        ),
      );
  }

  private setupHandlers: PaidHandler[] = [];

  /** Implementación pagada (HU55): tarea de onboarding y correo. */
  onSetupPaid(h: PaidHandler) {
    this.setupHandlers.push(h);
  }

  private async onPreapproval(pre: MpPreapproval) {
    if (!pre.external_reference) return;
    const session = await this.sessions
      .findOne({ publicId: pre.external_reference })
      .exec();
    if (!session) return;
    if (!session.mpPreapprovalId) {
      session.mpPreapprovalId = pre.id;
      await session.save();
    }
  }

  findByPublicId(publicId: string) {
    return this.sessions.findOne({ publicId }).exec();
  }
}

function paymentMethodOf(payment: Payment): string | undefined {
  return payment.paymentType;
}
