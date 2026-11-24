import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { Model, Types } from 'mongoose';
import { Event } from '../events/event.schema';
import { EventRegistration } from '../events/event-registration.schema';
import { MailService, type EmailDesign } from '../mail/mail.service';
import {
  MercadoPagoClient,
  type MpPayment,
} from '../billing/mercadopago/mercadopago.client';
import { SecretBox } from '../shared/secret-box';
import { emitAutomation } from '../automations/automation-bus';
import { MpSellerConnection } from './mp-seller-connection.schema';

const HOLD_MS = 30 * 60_000;
const STATE_TTL_MS = 15 * 60_000;
const REFRESH_BEFORE_MS = 3 * 86_400_000;
const PURPOSE = 'mp-seller';
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CheckoutInput {
  ticketType: string;
  quantity?: number;
  name: string;
  email: string;
  phone?: string;
  customFields?: Record<string, string>;
}

export interface CheckoutResult {
  registrationId: string;
  ticketCode: string;
  amount: number;
  currency: string;
  /** URL de Checkout Pro; vacía si la entrada es gratis. */
  initPoint: string;
  paymentStatus: 'pending' | 'paid';
}

/**
 * Venta de entradas en línea (HU67): conexión OAuth de la cuenta de Mercado
 * Pago de la empresa, cupo por tipo de entrada, Checkout Pro con comisión de
 * Maya, confirmación por webhook, reembolso y liberación de cupos vencidos.
 */
@Injectable()
export class EventTicketsService {
  private readonly logger = new Logger(EventTicketsService.name);
  private readonly box: SecretBox;
  /** Otros cobros con la cuenta conectada (p. ej. cotizaciones, HU68), por prefijo de `external_reference`. */
  private readonly handlers = new Map<
    string,
    (tenantId: Types.ObjectId, payment: MpPayment) => Promise<void>
  >();

  constructor(
    @InjectModel(Event.name) private events: Model<Event>,
    @InjectModel(EventRegistration.name) private regs: Model<EventRegistration>,
    @InjectModel(MpSellerConnection.name)
    private conns: Model<MpSellerConnection>,
    private mp: MercadoPagoClient,
    private mail: MailService,
    private config: ConfigService,
  ) {
    this.box = new SecretBox(
      config.get<string>('EMAIL_ENCRYPTION_KEY') ||
        config.getOrThrow<string>('JWT_SECRET'),
    );
  }

  /** Comisión de Maya por entrada vendida, en %. */
  feePct(): number {
    const v = Number(this.config.get<string>('EVENT_TICKET_FEE_PCT') ?? 3);
    return Number.isFinite(v) ? Math.min(30, Math.max(0, v)) : 3;
  }

  private base(key: 'PUBLIC_API_URL' | 'FRONTEND_URL') {
    return (this.config.get<string>(key) || '').replace(/\/$/, '');
  }

  // ── Conexión OAuth ─────────────────────────────────────────────────────

  redirectUri() {
    return `${this.base('PUBLIC_API_URL')}/event-tickets/mp/callback`;
  }

  authorizeUrl(tenantId: string, userId: string): string {
    const app = this.mp.oauthApp();
    if (!app)
      throw new BadRequestException(
        'El cobro de entradas no está habilitado en la plataforma (falta MP_CLIENT_ID).',
      );
    const q = new URLSearchParams({
      client_id: app.clientId,
      response_type: 'code',
      platform_id: 'mp',
      state: this.signState({ tenantId, userId }),
      redirect_uri: this.redirectUri(),
    });
    return `https://auth.mercadopago.com/authorization?${q}`;
  }

  signState(s: { tenantId: string; userId: string }): string {
    const json = Buffer.from(
      JSON.stringify({
        ...s,
        purpose: PURPOSE,
        nonce: randomBytes(8).toString('hex'),
        exp: Date.now() + STATE_TTL_MS,
      }),
    );
    const sig = createHmac(
      'sha256',
      this.config.getOrThrow<string>('JWT_SECRET'),
    )
      .update(json)
      .digest();
    return `${json.toString('base64url')}.${sig.toString('base64url')}`;
  }

  verifyState(state: string): { tenantId: string; userId: string } | null {
    const [p, s] = (state || '').split('.');
    if (!p || !s) return null;
    try {
      const json = Buffer.from(p, 'base64url');
      const expected = createHmac(
        'sha256',
        this.config.getOrThrow<string>('JWT_SECRET'),
      )
        .update(json)
        .digest();
      const sig = Buffer.from(s, 'base64url');
      if (sig.length !== expected.length || !timingSafeEqual(sig, expected))
        return null;
      const v = JSON.parse(json.toString()) as {
        tenantId: string;
        userId: string;
        purpose: string;
        exp: number;
      };
      if (v.purpose !== PURPOSE || v.exp < Date.now()) return null;
      return { tenantId: v.tenantId, userId: v.userId };
    } catch {
      return null;
    }
  }

  async connect(code: string, state: string): Promise<void> {
    const s = this.verifyState(state);
    if (!s)
      throw new BadRequestException(
        'Estado inválido o expirado, intenta de nuevo',
      );
    const t = await this.mp.oauthToken({
      code,
      redirectUri: this.redirectUri(),
    });
    await this.saveToken(s.tenantId, t, s.userId);
  }

  private async saveToken(
    tenantId: string,
    t: {
      access_token: string;
      refresh_token?: string;
      public_key?: string;
      user_id: number | string;
      expires_in?: number;
      live_mode?: boolean;
    },
    userId?: string,
  ) {
    await this.conns
      .updateOne(
        { tenantId: new Types.ObjectId(tenantId) },
        {
          $set: {
            mpUserId: String(t.user_id),
            accessToken: this.box.encrypt(t.access_token),
            ...(t.refresh_token
              ? { refreshToken: this.box.encrypt(t.refresh_token) }
              : {}),
            publicKey: t.public_key,
            expiresAt: t.expires_in
              ? new Date(Date.now() + t.expires_in * 1000)
              : undefined,
            liveMode: !!t.live_mode,
            ...(userId && Types.ObjectId.isValid(userId)
              ? { connectedBy: new Types.ObjectId(userId) }
              : {}),
          },
        },
        { upsert: true },
      )
      .exec();
  }

  async status(tenantId: string) {
    const c = await this.conns
      .findOne({ tenantId: new Types.ObjectId(tenantId) })
      .lean<MpSellerConnection>()
      .exec();
    return {
      available: !!this.mp.oauthApp(),
      connected: !!c,
      mpUserId: c?.mpUserId ?? null,
      liveMode: c?.liveMode ?? false,
      connectedAt: c?.createdAt ?? null,
      feePct: this.feePct(),
    };
  }

  async disconnect(tenantId: string) {
    await this.conns
      .deleteOne({ tenantId: new Types.ObjectId(tenantId) })
      .exec();
    return { connected: false };
  }

  /** Registra quién atiende los pagos con `external_reference` `<prefijo>:<id>`. */
  registerPaymentHandler(
    prefix: string,
    fn: (tenantId: Types.ObjectId, payment: MpPayment) => Promise<void>,
  ) {
    this.handlers.set(prefix, fn);
  }

  /** URL del webhook de pagos de las cuentas conectadas. */
  notificationUrl() {
    return `${this.base('PUBLIC_API_URL')}/public/event-payments/webhook`;
  }

  /** Token vigente de la empresa; lo renueva si está por vencer. */
  async sellerToken(tenantId: string | Types.ObjectId): Promise<string> {
    const c = await this.conns
      .findOne({ tenantId: new Types.ObjectId(String(tenantId)) })
      .exec();
    if (!c)
      throw new ConflictException(
        'La empresa aún no conectó su cuenta de Mercado Pago para cobrar entradas.',
      );
    if (
      c.refreshToken &&
      c.expiresAt &&
      c.expiresAt.getTime() - Date.now() < REFRESH_BEFORE_MS
    ) {
      try {
        const t = await this.mp.oauthToken({
          refreshToken: this.box.decrypt(c.refreshToken),
        });
        await this.saveToken(String(c.tenantId), t);
        return t.access_token;
      } catch (err) {
        this.logger.warn(
          `No se pudo renovar el token de Mercado Pago de ${String(c.tenantId)}: ${(err as Error).message}`,
        );
      }
    }
    return this.box.decrypt(c.accessToken);
  }

  // ── Compra ─────────────────────────────────────────────────────────────

  async checkout(eventId: string, dto: CheckoutInput): Promise<CheckoutResult> {
    const event = Types.ObjectId.isValid(eventId)
      ? await this.events.findById(eventId).exec()
      : null;
    if (!event || event.status !== 'published')
      throw new NotFoundException('Evento no disponible');
    if (!event.onlinePayment)
      throw new BadRequestException('Este evento no vende entradas en línea');
    const tt = (event.ticketTypes ?? []).find((t) => t.key === dto.ticketType);
    if (!tt) throw new BadRequestException('Tipo de entrada no válido');
    if (tt.salesEndAt && new Date(tt.salesEndAt).getTime() < Date.now())
      throw new BadRequestException(`La venta de "${tt.name}" ya cerró`);
    const qty = Math.floor(dto.quantity ?? 1);
    if (qty < 1 || qty > 10)
      throw new BadRequestException('Puedes comprar de 1 a 10 entradas');
    const amount = round2(tt.price * qty);
    // Antes de reservar: sin cuenta conectada no se bloquean cupos.
    const token = amount > 0 ? await this.sellerToken(event.tenantId) : '';

    if (event.capacity > 0) {
      const sold = (event.ticketTypes ?? []).reduce(
        (n, t) => n + (t.sold ?? 0),
        0,
      );
      if (sold + qty > event.capacity)
        throw new ConflictException('Se agotaron las entradas del evento');
    }
    const reserved = await this.events
      .findOneAndUpdate(
        {
          _id: event._id,
          ticketTypes: {
            $elemMatch: {
              key: tt.key,
              ...(tt.capacity > 0 ? { sold: { $lte: tt.capacity - qty } } : {}),
            },
          },
        },
        { $inc: { 'ticketTypes.$.sold': qty } },
        { new: true },
      )
      .exec();
    if (!reserved)
      throw new ConflictException(`Se agotaron las entradas "${tt.name}"`);

    const currency = event.currency || 'PEN';
    const ticketCode = randomUUID().toUpperCase().replace(/-/g, '').slice(0, 8);
    const free = amount === 0;
    const reg = await this.regs.create({
      eventId: event._id,
      tenantId: event.tenantId,
      name: dto.name.trim(),
      email: dto.email.trim().toLowerCase(),
      phone: dto.phone?.trim() || undefined,
      partySize: qty,
      ticketCode,
      customFields: dto.customFields ?? {},
      ticketType: tt.key,
      ticketTypeName: tt.name,
      amount,
      currency,
      feeAmount: free ? 0 : round2((amount * this.feePct()) / 100),
      paymentStatus: free ? 'paid' : 'pending',
      ...(free
        ? { paidAt: new Date() }
        : { holdExpiresAt: new Date(Date.now() + HOLD_MS) }),
    });

    if (free) {
      this.confirmed(event, reg);
      return {
        registrationId: String(reg._id),
        ticketCode,
        amount,
        currency,
        initPoint: '',
        paymentStatus: 'paid',
      };
    }

    try {
      const pref = await this.mp.createPreferenceFor(
        token,
        this.preferenceBody(event, tt.key, tt.name, tt.price, qty, reg),
        `evt-${String(reg._id)}`,
      );
      reg.mpPreferenceId = pref.id;
      await reg.save();
      return {
        registrationId: String(reg._id),
        ticketCode,
        amount,
        currency,
        initPoint: pref.init_point,
        paymentStatus: 'pending',
      };
    } catch (err) {
      this.logger.warn(
        `Preferencia de entrada ${String(reg._id)} falló: ${(err as Error).message}`,
      );
      await this.release(reg);
      await this.regs.deleteOne({ _id: reg._id }).exec();
      throw new BadGatewayException(
        'No se pudo iniciar el pago con Mercado Pago. Intenta de nuevo.',
      );
    }
  }

  /** Cuerpo de la preferencia de Checkout Pro (exportado para pruebas). */
  preferenceBody(
    event: Event,
    key: string,
    name: string,
    price: number,
    qty: number,
    reg: EventRegistration,
  ) {
    const back = (pago: string) =>
      `${this.base('FRONTEND_URL')}/e/${event.slug}?pago=${pago}&t=${reg.ticketCode}`;
    return {
      items: [
        {
          id: key,
          title: `${event.title} — ${name}`.slice(0, 250),
          quantity: qty,
          unit_price: price,
          currency_id: event.currency || 'PEN',
        },
      ],
      payer: { name: reg.name, email: reg.email },
      marketplace_fee: reg.feeAmount ?? 0,
      external_reference: `evt:${String(reg._id)}`,
      notification_url: `${this.base('PUBLIC_API_URL')}/public/event-payments/webhook`,
      back_urls: {
        success: back('ok'),
        pending: back('pendiente'),
        failure: back('error'),
      },
      auto_return: 'approved',
      expires: true,
      expiration_date_to: reg.holdExpiresAt?.toISOString(),
    };
  }

  // ── Confirmación por webhook ───────────────────────────────────────────

  /**
   * Notificación de pago de una cuenta conectada. Solo se usa el id del pago;
   * su estado se consulta a Mercado Pago con el token de esa empresa.
   */
  async onPaymentNotification(
    sellerUserId: string | undefined,
    paymentId: string,
  ): Promise<void> {
    if (!sellerUserId) return;
    const conn = await this.conns
      .findOne({ mpUserId: String(sellerUserId) })
      .exec();
    if (!conn) {
      this.logger.warn(
        `Pago ${paymentId} de una cuenta de Mercado Pago no conectada (${sellerUserId})`,
      );
      return;
    }
    const payment = await this.mp.getPaymentFor(
      await this.sellerToken(conn.tenantId),
      paymentId,
    );
    await this.applyPayment(conn.tenantId, payment);
  }

  async applyPayment(
    tenantId: Types.ObjectId,
    payment: MpPayment,
  ): Promise<void> {
    const prefix = /^([a-z]+):/.exec(payment.external_reference ?? '')?.[1];
    if (prefix && prefix !== 'evt') {
      await this.handlers.get(prefix)?.(tenantId, payment);
      return;
    }
    const ref = /^evt:([a-f0-9]{24})$/.exec(
      payment.external_reference ?? '',
    )?.[1];
    if (!ref) return;
    const reg = await this.regs.findOne({ _id: ref, tenantId }).exec();
    if (!reg) return;
    const status = payment.status;
    if (status === 'approved') {
      if (reg.paymentStatus === 'paid') return;
      // Pagó después de vencer la reserva: se vuelve a sumar el cupo.
      if (reg.paymentStatus === 'expired' || reg.paymentStatus === 'rejected')
        await this.reserveAgain(reg);
      const updated = await this.regs
        .findOneAndUpdate(
          { _id: reg._id, paymentStatus: { $ne: 'paid' } },
          {
            $set: {
              paymentStatus: 'paid',
              status: 'confirmed',
              mpPaymentId: String(payment.id),
              paidAt: new Date(),
            },
            $unset: { holdExpiresAt: 1 },
          },
          { new: true },
        )
        .exec();
      if (!updated) return;
      const event = await this.events.findById(reg.eventId).exec();
      if (event) this.confirmed(event, updated);
    } else if (status === 'rejected' || status === 'cancelled') {
      const updated = await this.regs
        .findOneAndUpdate(
          { _id: reg._id, paymentStatus: 'pending' },
          {
            $set: {
              paymentStatus: 'rejected',
              status: 'cancelled',
              mpPaymentId: String(payment.id),
            },
            $unset: { holdExpiresAt: 1 },
          },
        )
        .exec();
      if (updated) await this.release(reg);
    } else if (status === 'refunded' || status === 'charged_back') {
      const updated = await this.regs
        .findOneAndUpdate(
          { _id: reg._id, paymentStatus: 'paid' },
          { $set: { paymentStatus: 'refunded', status: 'cancelled' } },
        )
        .exec();
      if (updated) await this.release(reg);
    } else if (!reg.mpPaymentId) {
      reg.mpPaymentId = String(payment.id);
      await reg.save();
    }
  }

  private confirmed(event: Event, reg: EventRegistration): void {
    emitAutomation({
      type: 'event_registered',
      tenantId: String(event.tenantId),
      eventId: String(event._id),
      registrationId: String(reg._id),
      name: reg.name,
      email: reg.email,
      phone: reg.phone,
    });
    void this.mail.sendEventConfirmationEmail({
      email: reg.email,
      name: reg.name,
      eventTitle: event.title,
      eventDate: event.date.toISOString().split('T')[0],
      eventTime: event.startTime,
      ticketCode: reg.ticketCode,
      partySize: reg.partySize,
      design:
        (event.invitationDesign?.['emailDesign'] as EmailDesign | undefined) ??
        null,
    });
  }

  private async release(reg: EventRegistration) {
    if (!reg.ticketType) return;
    await this.events
      .updateOne(
        {
          _id: reg.eventId,
          ticketTypes: {
            $elemMatch: { key: reg.ticketType, sold: { $gte: reg.partySize } },
          },
        },
        { $inc: { 'ticketTypes.$.sold': -reg.partySize } },
      )
      .exec();
  }

  private async reserveAgain(reg: EventRegistration) {
    if (!reg.ticketType) return;
    await this.events
      .updateOne(
        { _id: reg.eventId, 'ticketTypes.key': reg.ticketType },
        { $inc: { 'ticketTypes.$.sold': reg.partySize } },
      )
      .exec();
  }

  /** Libera el cupo de los pagos que no se completaron a tiempo. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireHolds(now = new Date()): Promise<number> {
    const stale = await this.regs
      .find({ paymentStatus: 'pending', holdExpiresAt: { $lt: now } })
      .limit(200)
      .exec();
    let n = 0;
    for (const reg of stale) {
      const res = await this.regs
        .updateOne(
          { _id: reg._id, paymentStatus: 'pending' },
          {
            $set: { paymentStatus: 'expired', status: 'cancelled' },
            $unset: { holdExpiresAt: 1 },
          },
        )
        .exec();
      if (res.modifiedCount) {
        await this.release(reg);
        n++;
      }
    }
    return n;
  }

  // ── Reembolso ──────────────────────────────────────────────────────────

  async refund(tenantId: string, eventId: string, regId: string) {
    const reg = Types.ObjectId.isValid(regId)
      ? await this.regs.findById(regId).exec()
      : null;
    if (!reg || String(reg.eventId) !== eventId)
      throw new NotFoundException('Registro no encontrado');
    if (String(reg.tenantId) !== tenantId) throw new ForbiddenException();
    if (reg.paymentStatus !== 'paid' || !reg.mpPaymentId)
      throw new ConflictException(
        'Solo se reembolsa una entrada pagada en línea',
      );
    try {
      await this.mp.refundPaymentFor(
        await this.sellerToken(tenantId),
        reg.mpPaymentId,
      );
    } catch (err) {
      if (err instanceof ConflictException) throw err;
      throw new BadGatewayException(
        `Mercado Pago no aceptó el reembolso: ${(err as Error).message.slice(0, 200)}`,
      );
    }
    await this.regs
      .updateOne(
        { _id: reg._id, paymentStatus: 'paid' },
        { $set: { paymentStatus: 'refunded', status: 'cancelled' } },
      )
      .exec();
    await this.release(reg);
    return this.regs.findById(reg._id).exec();
  }
}
