import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { Coupon } from './coupon.schema';
import { CheckoutSession } from '../checkout-session.schema';
import { PERIOD_NAMES_ES } from './coupon-math';
import { Tenant } from '../../tenants/tenant.schema';
import { agreedPrice } from '../agreed-price';
import { isPlanId, withIgv } from '../plans.catalog';

/** Programa fundador (HU54): −30 % de por vida en trimestral o anual, 30 cupos. */
export const FOUNDER_CODE = 'FUNDADOR';
const FOUNDER: Partial<Coupon> = {
  code: FOUNDER_CODE,
  type: 'percent',
  value: 30,
  plans: [],
  periods: ['quarterly', 'annual'],
  duration: 'forever',
  maxUses: 30,
  active: true,
  label: 'Precio fundador: −30 % de por vida',
};

/** Una reserva sin pago aprobado se libera a las 24 h. */
export const COUPON_HOLD_MS = 24 * 3600_000;
/** Un pago rechazado libera su cupo a la hora. */
export const REJECTED_HOLD_MS = 3600_000;

export const normalizeCode = (c: string) =>
  c.trim().toUpperCase().replace(/\s+/g, '');

export interface CouponInput {
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  currency?: 'PEN' | 'USD';
  plans?: string[];
  periods?: string[];
  duration: 'once' | 'months' | 'forever';
  durationMonths?: number;
  maxUses?: number;
  validFrom?: Date;
  validUntil?: Date;
  active?: boolean;
  label?: string;
}

@Injectable()
export class CouponsService implements OnModuleInit {
  private readonly logger = new Logger(CouponsService.name);

  constructor(
    @InjectModel(Coupon.name) private coupons: Model<Coupon>,
    @InjectModel(CheckoutSession.name)
    private sessions: Model<CheckoutSession>,
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
  ) {}

  /**
   * Descuentos con fin (una vez, N meses) que ya terminaron: el precio pactado
   * vuelve al de lista (con sus add-ons) y, en mensual, se lleva a Mercado Pago
   * con el cron de montos de HU52.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async expireDiscounts(now = new Date()): Promise<number> {
    const list = await this.tenants
      .find({ 'subscription.discount.endsAt': { $lte: now } })
      .limit(500)
      .lean()
      .exec();
    let n = 0;
    for (const t of list) {
      const sub = t.subscription!;
      if (!sub.period || !sub.currency || !isPlanId(t.plan)) continue;
      const amount = agreedPrice(t, t.plan, sub.period, sub.currency, now);
      const monthly = sub.period === 'monthly' && !!sub.mpPreapprovalId;
      const res = await this.tenants
        .updateOne(
          { _id: t._id, 'subscription.discount.endsAt': { $lte: now } },
          {
            $set: {
              'subscription.amount': amount,
              ...(monthly
                ? {
                    'subscription.preapprovalAmountTarget':
                      sub.currency === 'PEN' ? withIgv(amount) : amount,
                  }
                : {}),
            },
            $unset: { 'subscription.discount': '' },
          },
        )
        .exec();
      n += res.modifiedCount;
    }
    return n;
  }

  async onModuleInit() {
    await this.coupons
      .updateOne(
        { code: FOUNDER_CODE },
        { $setOnInsert: FOUNDER },
        { upsert: true },
      )
      .exec()
      .catch((err) => this.logger.warn(`Cupón fundador: ${String(err)}`));
  }

  /** Motivo por el que el cupón no aplica, o null si aplica. */
  reason(
    c: Coupon | null,
    plan: string,
    period: string,
    currency: string,
    now = new Date(),
  ): string | null {
    if (!c || !c.active) return 'Cupón no válido';
    if (c.validFrom && c.validFrom > now)
      return 'Este cupón aún no está vigente';
    if (c.validUntil && c.validUntil <= now) return 'Este cupón venció';
    if (c.periods?.length && !c.periods.includes(period))
      return `Este cupón es solo para pago ${c.periods.map((p) => PERIOD_NAMES_ES[p] ?? p).join(' o ')}`;
    if (c.plans?.length && !c.plans.includes(plan))
      return 'Este cupón no aplica a este plan';
    if (c.type === 'fixed' && c.currency && c.currency !== currency)
      return `Este cupón es para pagos en ${c.currency === 'USD' ? 'dólares' : 'soles'}`;
    if (c.maxUses != null && c.used >= c.maxUses) return 'Cupos agotados';
    return null;
  }

  /** Valida sin reservar (cotización). */
  async check(code: string, plan: string, period: string, currency: string) {
    const c = await this.coupons
      .findOne({ code: normalizeCode(code) })
      .lean()
      .exec();
    const why = this.reason(c, plan, period, currency);
    if (why) throw new BadRequestException(why);
    return c!;
  }

  /** Reserva un cupo de forma atómica (al crear el checkout). */
  async reserve(code: string, plan: string, period: string, currency: string) {
    const c = await this.check(code, plan, period, currency);
    const res = await this.coupons
      .findOneAndUpdate(
        {
          _id: c._id,
          active: true,
          $or: [
            { maxUses: { $exists: false } },
            { maxUses: null },
            { $expr: { $lt: ['$used', '$maxUses'] } },
          ],
        },
        { $inc: { used: 1 } },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();
    if (!res) throw new BadRequestException('Cupos agotados');
    return res;
  }

  async release(code: string) {
    await this.coupons
      .updateOne({ code, used: { $gt: 0 } }, { $inc: { used: -1 } })
      .exec();
  }

  /**
   * Libera el cupo de una compra una sola vez: si la sesión existe, se marca
   * `releasedAt` de forma condicional; si no llegó a guardarse, se libera directo.
   */
  async releaseSession(publicId: string, code: string, now = new Date()) {
    const s = await this.sessions
      .findOneAndUpdate(
        {
          publicId,
          'coupon.code': code,
          'coupon.releasedAt': { $exists: false },
        },
        { $set: { 'coupon.releasedAt': now } },
      )
      .lean()
      .exec();
    if (s) return this.release(code);
    if (!(await this.sessions.exists({ publicId }).exec()))
      await this.release(code);
  }

  /**
   * Pago aprobado de una reserva ya liberada: vuelve a contar una sola vez
   * (`reclaimedAt` condicional). Puede pasar el tope: el cliente ya pagó con el
   * descuento y se le respeta.
   */
  async reclaimSession(publicId: string, now = new Date()) {
    const s = await this.sessions
      .findOneAndUpdate(
        {
          publicId,
          'coupon.releasedAt': { $exists: true },
          'coupon.reclaimedAt': { $exists: false },
        },
        { $set: { 'coupon.reclaimedAt': now } },
      )
      .lean()
      .exec();
    if (!s?.coupon) return;
    this.logger.warn(
      `Cupón ${s.coupon.code}: pago aprobado después de liberar el cupo (${publicId})`,
    );
    await this.coupons
      .updateOne({ code: s.coupon.code }, { $inc: { used: 1 } })
      .exec();
  }

  /** Cupos que quedan (landing). */
  async remaining(code = FOUNDER_CODE) {
    const c = await this.coupons.findOne({ code }).lean().exec();
    if (!c || !c.active || (c.validUntil && c.validUntil <= new Date()))
      return { code, remaining: 0, active: false };
    return {
      code,
      remaining: c.maxUses == null ? null : Math.max(0, c.maxUses - c.used),
      active: true,
      label: c.label,
    };
  }

  /** Libera los cupos de checkouts sin pago aprobado en 24 h. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async releaseExpired(now = new Date()): Promise<number> {
    let n = 0;
    for (let i = 0; i < 200; i++) {
      const s = await this.sessions
        .findOneAndUpdate(
          {
            'coupon.code': { $exists: true },
            'coupon.releasedAt': { $exists: false },
            // Rechazado: se libera a la hora (reintentar no ocupa dos cupos un día).
            $or: [
              {
                status: { $in: ['pending', 'awaiting_payment'] },
                createdAt: { $lt: new Date(now.getTime() - COUPON_HOLD_MS) },
              },
              {
                status: 'rejected',
                updatedAt: { $lt: new Date(now.getTime() - REJECTED_HOLD_MS) },
              },
            ],
          },
          { $set: { 'coupon.releasedAt': now } },
        )
        .lean()
        .exec();
      if (!s?.coupon) break;
      await this.release(s.coupon.code);
      n++;
    }
    return n;
  }

  // ── Superadmin (la pantalla llega con HU57) ──

  list() {
    return this.coupons.find().sort({ createdAt: -1 }).lean().exec();
  }

  private validate(i: Partial<CouponInput>) {
    if (
      i.type === 'percent' &&
      i.value != null &&
      (i.value <= 0 || i.value > 100)
    )
      throw new BadRequestException('El porcentaje va de 1 a 100');
    if (i.type === 'fixed' && i.value != null && i.value <= 0)
      throw new BadRequestException('El monto debe ser mayor a 0');
    if (i.type === 'fixed' && !i.currency)
      throw new BadRequestException(
        'Un cupón de monto fijo necesita su moneda',
      );
    if (i.duration === 'months' && !(i.durationMonths && i.durationMonths > 0))
      throw new BadRequestException('Indica cuántos meses dura el descuento');
  }

  async create(i: CouponInput) {
    this.validate(i);
    const code = normalizeCode(i.code);
    if (!code) throw new BadRequestException('Falta el código');
    try {
      return await this.coupons.create({ ...i, code, used: 0 });
    } catch (err) {
      if ((err as { code?: number }).code === 11000)
        throw new ConflictException('Ya existe un cupón con ese código');
      throw err;
    }
  }

  async update(id: string, i: Partial<CouponInput>) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Cupón no encontrado');
    const prev = await this.coupons.findById(id).lean().exec();
    if (!prev) throw new NotFoundException('Cupón no encontrado');
    this.validate({ ...prev, ...i });
    // El código no cambia: ya puede estar en suscripciones y comprobantes.
    const { code: _code, ...rest } = i;
    void _code;
    return this.coupons
      .findByIdAndUpdate(id, { $set: rest }, { returnDocument: 'after' })
      .lean()
      .exec();
  }
}
