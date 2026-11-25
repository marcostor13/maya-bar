import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { Payment, type ReceiptDoc } from '../payment.schema';
import { CheckoutSession } from '../checkout-session.schema';
import { Tenant } from '../../tenants/tenant.schema';
import { User } from '../../users/user.schema';
import { BillingMailer } from '../emails/billing-mailer.service';
import { T } from '../emails/billing-email.templates';
import { ADDONS, isAddonId } from '../addons.catalog';
import { SETUP_REF_SUFFIX } from '../checkout.service';

const round2 = (n: number) => Math.round(n * 100) / 100;
const setupDescription = (name: string) =>
  `Maya CRM — Servicio de implementación: ${name}`;
import { BillingHooks, type PaymentChange } from '../billing-hooks.service';
import { InvoiceCounter } from './invoice-counter.schema';
import {
  INVOICE_PROVIDER,
  limaDate,
  splitIgv,
  type InvoiceProvider,
  type InvoiceRequest,
} from './invoice-provider';
import { isValidRuc } from '../ruc';
import { PERIOD_MONTHS, PLANS, addMonths, isPlanId } from '../plans.catalog';
import type { BillingPeriod } from '../plans.catalog';

/** Tras estos intentos el comprobante queda `failed`, visible al superadmin. */
export const MAX_RECEIPT_ATTEMPTS = 8;
/** Boleta sin documento del cliente: solo por debajo de S/ 700 (SUNAT). */
const BOLETA_NO_DOC_LIMIT = 700;
const LOCK_MS = 2 * 60_000;

const PERIOD_NAMES: Record<BillingPeriod, string> = {
  monthly: 'mensual',
  quarterly: 'trimestral',
  annual: 'anual',
};
const ddmm = (d: Date) => {
  const { dd, mm } = limaDate(d);
  return `${dd}/${mm}`;
};

type Kind = 'receipt' | 'creditNote';

interface Billing {
  docType?: string;
  docNumber?: string;
  legalName?: string;
  address?: string;
  email?: string;
}

/**
 * Comprobantes electrónicos SUNAT (HU49). Cada pago aprobado deja su
 * comprobante en cola dentro del propio `payment` (`receipt.status`); un
 * cron lo emite con reintentos. El acceso del cliente nunca depende de esto.
 */
@Injectable()
export class InvoicingService implements OnModuleInit {
  private readonly logger = new Logger(InvoicingService.name);

  constructor(
    @InjectModel(Payment.name) private payments: Model<Payment>,
    @InjectModel(CheckoutSession.name) private sessions: Model<CheckoutSession>,
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
    @InjectModel(User.name) private users: Model<User>,
    @InjectModel(InvoiceCounter.name) private counters: Model<InvoiceCounter>,
    @Inject(INVOICE_PROVIDER) private provider: InvoiceProvider,
    private hooks: BillingHooks,
    private mailer: BillingMailer,
    private config: ConfigService,
  ) {}

  onModuleInit() {
    this.hooks.onPayment((e) => this.onPayment(e));
  }

  /** Pago aprobado → comprobante en cola; reembolso → nota de crédito (C3). */
  async onPayment({ payment, previousStatus }: PaymentChange) {
    if (payment.status === 'approved' && previousStatus !== 'approved') {
      // Sin INVOICING_AUTO=true el comprobante se emite a mano (HU75).
      const auto = this.config.get<string>('INVOICING_AUTO') === 'true';
      const res = await this.payments
        .updateOne(
          { _id: payment._id, 'receipt.status': { $exists: false } },
          {
            $set: auto
              ? { 'receipt.status': 'pending', 'receipt.attempts': 0 }
              : { 'receipt.status': 'manual' },
          },
        )
        .exec();
      if (res.modifiedCount && auto) this.kick(payment._id, 'receipt');
    }
    if (payment.status === 'refunded') {
      // Reembolsado antes de facturarlo a mano: sale de "Por facturar" (HU75).
      await this.payments
        .updateOne(
          { _id: payment._id, 'receipt.status': 'manual' },
          {
            $set: {
              'receipt.status': 'skipped',
              'receipt.skippedReason': 'Reembolsado antes de facturar',
            },
          },
        )
        .exec();
      const res = await this.payments
        .updateOne(
          {
            _id: payment._id,
            'receipt.status': 'issued',
            'receipt.creditNote': { $exists: false },
          },
          {
            $set: {
              'receipt.creditNote': { status: 'pending', attempts: 0 },
            },
          },
        )
        .exec();
      if (res.modifiedCount) this.kick(payment._id, 'creditNote');
    }
  }

  /** Intento inmediato fuera de la petición del webhook. */
  private kick(id: Types.ObjectId, kind: Kind) {
    setImmediate(() => {
      this.processOne(id, kind).catch((e) =>
        this.logger.error(`Comprobante ${String(id)}: ${String(e)}`),
      );
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async drain(now = new Date()): Promise<number> {
    let n = 0;
    for (const kind of ['receipt', 'creditNote'] as Kind[]) {
      const due = await this.payments
        .find({
          [`receipt${kind === 'creditNote' ? '.creditNote' : ''}.status`]:
            'pending',
          $or: [
            { [`${this.path(kind)}.nextAttemptAt`]: { $exists: false } },
            { [`${this.path(kind)}.nextAttemptAt`]: { $lte: now } },
          ],
        })
        .select('_id')
        .limit(50)
        .lean()
        .exec();
      for (const p of due) if (await this.processOne(p._id, kind)) n++;
      // Comprobantes emitidos cuyo correo falló: se reintenta (la bitácora no repite).
      const unsent = await this.payments
        .find({
          [`${this.path(kind)}.status`]: 'issued',
          [`${this.path(kind)}.emailedAt`]: { $exists: false },
          [`${this.path(kind)}.issuedAt`]: {
            $gte: new Date(now.getTime() - 7 * 86400_000),
          },
        })
        .select('_id')
        .limit(50)
        .lean()
        .exec();
      for (const p of unsent)
        await this.sendEmail(p._id, kind).catch((e) =>
          this.logger.error(
            `Correo del comprobante ${String(p._id)}: ${String(e)}`,
          ),
        );
    }
    return n;
  }

  private path(kind: Kind) {
    return kind === 'creditNote' ? 'receipt.creditNote' : 'receipt';
  }

  /** Reclama, emite y guarda; devuelve true si quedó emitido. */
  async processOne(id: Types.ObjectId, kind: Kind): Promise<boolean> {
    const now = new Date();
    const path = this.path(kind);
    const payment = await this.payments
      .findOneAndUpdate(
        {
          _id: id,
          [`${path}.status`]: 'pending',
          $or: [
            { [`${path}.lockedUntil`]: { $exists: false } },
            { [`${path}.lockedUntil`]: { $lt: now } },
          ],
        },
        {
          $set: { [`${path}.lockedUntil`]: new Date(now.getTime() + LOCK_MS) },
        },
        { returnDocument: 'after' },
      )
      .exec();
    if (!payment) return false;
    const doc = (
      kind === 'creditNote' ? payment.receipt?.creditNote : payment.receipt
    ) as ReceiptDoc;
    try {
      if (!this.provider.configured()) {
        // Sin proveedor no se gasta un intento: se espera a que lo configuren.
        await this.save(id, path, {
          error:
            'Facturación electrónica no configurada (NUBEFACT_URL / NUBEFACT_TOKEN)',
          nextAttemptAt: new Date(now.getTime() + 60 * 60_000),
        });
        return false;
      }
      // Reembolsado antes de emitir: no se factura un pago devuelto (H1).
      if (
        kind === 'receipt' &&
        payment.status === 'refunded' &&
        doc.number == null
      ) {
        await this.save(id, path, {
          status: 'skipped',
          skippedReason: 'Pago reembolsado antes de emitir el comprobante',
        });
        return false;
      }
      const req = await this.build(payment, kind, doc);
      if ('skip' in req) {
        await this.save(id, path, {
          status: 'skipped',
          skippedReason: req.skip,
        });
        return false;
      }
      // Número reservado antes de enviar: si se cortó a mitad, se consulta.
      const issued =
        (doc.number != null && (await this.provider.find(req))) ||
        (await this.provider.issue(req));
      await this.save(id, path, {
        status: 'issued',
        pdfUrl: issued.pdfUrl,
        xmlUrl: issued.xmlUrl,
        cdrUrl: issued.cdrUrl,
        acceptedBySunat: issued.acceptedBySunat,
        issuedAt: new Date(),
        error: undefined,
      });
      // Se reembolsó mientras el comprobante estaba en vuelo: toca nota de crédito.
      if (kind === 'receipt' && payment.status === 'refunded')
        await this.payments
          .updateOne(
            { _id: id, 'receipt.creditNote': { $exists: false } },
            {
              $set: {
                'receipt.creditNote': { status: 'pending', attempts: 0 },
              },
            },
          )
          .exec();
      await this.sendEmail(id, kind).catch((e) =>
        this.logger.error(`Correo del comprobante ${String(id)}: ${String(e)}`),
      );
      return true;
    } catch (err) {
      const attempts = (doc.attempts ?? 0) + 1;
      const failed = attempts >= MAX_RECEIPT_ATTEMPTS;
      this.logger.warn(
        `Comprobante ${String(id)} intento ${attempts}: ${String(err)}`,
      );
      await this.save(id, path, {
        attempts,
        error: String(err).slice(0, 500),
        ...(failed
          ? { status: 'failed' }
          : {
              nextAttemptAt: new Date(
                Date.now() + Math.min(2 ** attempts, 360) * 60_000,
              ),
            }),
      });
      return false;
    }
  }

  private async save(
    id: Types.ObjectId,
    path: string,
    fields: Record<string, unknown>,
  ) {
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = { [`${path}.lockedUntil`]: '' };
    for (const [k, v] of Object.entries(fields))
      if (v === undefined) $unset[`${path}.${k}`] = '';
      else $set[`${path}.${k}`] = v;
    await this.payments.updateOne({ _id: id }, { $set, $unset }).exec();
  }

  /** Datos del comprobante: quién, qué y cuánto. */
  private async build(
    payment: Payment,
    kind: Kind,
    doc: ReceiptDoc,
  ): Promise<InvoiceRequest | { skip: string }> {
    // Pago aparte de la implementación en mensual (HU55): `<publicId>:setup`.
    const setupPayment =
      !!payment.externalReference?.endsWith(SETUP_REF_SUFFIX);
    const publicId = setupPayment
      ? payment.externalReference!.slice(0, -SETUP_REF_SUFFIX.length)
      : payment.externalReference;
    const session = publicId
      ? await this.sessions.findOne({ publicId }).lean().exec()
      : null;
    const tenant = await this.tenantOf(payment, session);
    const billing: Billing =
      (session?.billing as Billing | undefined) ??
      (tenant as unknown as { billingInfo?: Billing })?.billingInfo ??
      {};

    if (
      payment.currency === 'USD' &&
      (this.config.get<string>('INVOICE_FOREIGN_MODE') ?? 'receipt') !==
        'export'
    )
      return { skip: 'Pago en dólares: solo recibo de Mercado Pago' };

    const { base, igv, total } =
      payment.currency === 'USD'
        ? { base: payment.amount, igv: 0, total: payment.amount }
        : splitIgv(payment.amount);

    // Con número ya reservado, el tipo no cambia aunque cambien los datos (H8).
    const reserved = kind === 'receipt' ? doc.type : payment.receipt?.type;
    const factura = reserved
      ? reserved === '01'
      : billing.docType === 'factura' && isValidRuc(billing.docNumber ?? '');
    const dni = /^\d{8}$/.test(billing.docNumber ?? '')
      ? billing.docNumber!
      : '';
    if (!factura && !dni && total >= BOLETA_NO_DOC_LIMIT)
      throw new Error('Boleta de S/ 700 o más sin DNI del cliente');

    const original = payment.receipt;
    const type: InvoiceRequest['type'] =
      kind === 'creditNote' ? '07' : factura ? '01' : '03';
    const baseType: '01' | '03' =
      kind === 'creditNote'
        ? (original!.type as '01' | '03')
        : factura
          ? '01'
          : '03';
    const series =
      doc.series ??
      this.series(kind === 'creditNote' ? `NC${baseType}` : baseType);
    let number = doc.number;
    if (number == null) {
      number = await this.nextNumber(series);
      // Se guarda antes de llamar al proveedor (reintento idempotente).
      await this.payments
        .updateOne(
          { _id: payment._id },
          {
            $set: {
              [`${this.path(kind)}.series`]: series,
              [`${this.path(kind)}.number`]: number,
              [`${this.path(kind)}.type`]: type,
            },
          },
        )
        .exec();
    }

    // Primer pago con cupón (HU54): el comprobante muestra el descuento; los
    // cobros mensuales siguientes no.
    // Pago único con implementación (HU55): el plan y la implementación en el mismo cobro.
    const withSetup =
      !setupPayment &&
      !!session?.setup &&
      !session.setup.separate &&
      Math.abs(payment.amount - (session.total + session.setup.total)) < 0.01;
    const firstTotal = session
      ? session.total + (withSetup ? session.setup!.total : 0)
      : 0;
    const couponFirst =
      kind === 'receipt' &&
      !setupPayment &&
      !!session?.coupon?.discount &&
      Math.abs(payment.amount - firstTotal) < 0.01 &&
      !(await this.payments
        .exists({
          externalReference: payment.externalReference,
          status: 'approved',
          _id: { $ne: payment._id },
          paidAt: { $lt: payment.paidAt },
        })
        .exec());
    return {
      type,
      series,
      number,
      issueDate: new Date(),
      currency: payment.currency,
      customer: factura
        ? {
            docType: '6',
            docNumber: billing.docNumber!,
            name: billing.legalName ?? tenant?.name ?? 'Cliente',
            address: billing.address,
            email: billing.email,
          }
        : {
            docType: dni ? '1' : '-',
            docNumber: dni || '-',
            name: billing.legalName ?? tenant?.name ?? 'Cliente varios',
            email: billing.email,
          },
      base,
      igv,
      total,
      export: payment.currency === 'USD',
      description:
        setupPayment && session?.setup
          ? setupDescription(session.setup.name)
          : this.description(
              payment,
              session && !couponFirst
                ? { ...session, coupon: undefined }
                : session,
            ),
      // Primer pago con cupón (HU54): el comprobante muestra el descuento.
      ...(couponFirst && !withSetup
        ? { discount: session.coupon!.discount }
        : {}),
      // Plan + implementación en el mismo pago: una línea para cada uno (HU55).
      ...(withSetup
        ? {
            lines: [
              {
                description: this.description(
                  payment,
                  couponFirst ? session : { ...session, coupon: undefined },
                ),
                base:
                  payment.currency === 'USD' ? session.total : session.subtotal,
                igv: payment.currency === 'USD' ? 0 : session.igv,
                total: session.total,
                ...(couponFirst ? { discount: session.coupon!.discount } : {}),
              },
              {
                description: setupDescription(session.setup!.name),
                base:
                  payment.currency === 'USD'
                    ? session.setup!.total
                    : session.setup!.subtotal,
                igv: payment.currency === 'USD' ? 0 : session.setup!.igv,
                total: session.setup!.total,
                ...(session.setup!.discount
                  ? { discount: session.setup!.discount }
                  : {}),
              },
            ],
            base:
              payment.currency === 'USD'
                ? total
                : round2(session.subtotal + session.setup!.subtotal),
            igv:
              payment.currency === 'USD'
                ? 0
                : round2(session.igv + session.setup!.igv),
          }
        : {}),
      ...(kind === 'creditNote'
        ? {
            refersTo: {
              type: baseType,
              series: original!.series!,
              number: original!.number!,
            },
          }
        : {}),
    };
  }

  private series(kind: string): string {
    const env: Record<string, [string, string]> = {
      '01': ['INVOICE_SERIES_FACTURA', 'F001'],
      '03': ['INVOICE_SERIES_BOLETA', 'B001'],
      NC01: ['INVOICE_SERIES_NC_FACTURA', 'FC01'],
      NC03: ['INVOICE_SERIES_NC_BOLETA', 'BC01'],
    };
    const [key, def] = env[kind];
    return this.config.get<string>(key) || def;
  }

  /** Correlativo por serie, atómico. */
  private async nextNumber(series: string): Promise<number> {
    const c = await this.counters
      .findOneAndUpdate(
        { _id: series },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' },
      )
      .exec();
    return c.seq;
  }

  /** "Suscripción Maya CRM — Plan Crece (mensual) 01/12–01/01". */
  private description(
    payment: Payment,
    session: {
      plan?: string;
      period?: BillingPeriod;
      kind?: string;
      addonId?: string;
      addonQty?: number;
      quotedPeriodEnd?: Date;
      coupon?: { code: string; type: string; value: number };
    } | null,
  ): string {
    // Add-on o recarga (HU53) y diferencia por subida de plan (HU52).
    if (session?.kind === 'addon' && isAddonId(session.addonId)) {
      const qty = session.addonQty ?? 1;
      return `Maya CRM — ${ADDONS[session.addonId].name}${qty > 1 ? ` × ${qty}` : ''}`;
    }
    if (session?.kind === 'upgrade' && isPlanId(session.plan))
      return `Maya CRM — Cambio al plan ${PLANS[session.plan].name}, diferencia ${ddmm(new Date(payment.paidAt))}${session.quotedPeriodEnd ? `–${ddmm(new Date(session.quotedPeriodEnd))}` : ''}`;
    const meta = payment.metadata ?? {};
    const plan = session?.plan ?? (meta.plan as string | undefined);
    const period =
      session?.period ?? (meta.period as BillingPeriod | undefined);
    if (!plan || !isPlanId(plan) || !period || !PERIOD_MONTHS[period])
      return payment.concept || 'Suscripción Maya CRM';
    // Pago manual (HU57): el periodo real puede empezar al vencer el anterior.
    const from = new Date(
      typeof meta.periodFrom === 'string' ? meta.periodFrom : payment.paidAt,
    );
    const to = addMonths(from, PERIOD_MONTHS[period]);
    const coupon = session?.coupon
      ? ` · Cupón ${session.coupon.code}${session.coupon.type === 'percent' ? ` (−${session.coupon.value} %)` : ''}`
      : '';
    return `Suscripción Maya CRM — Plan ${PLANS[plan].name} (${PERIOD_NAMES[period]}) ${ddmm(from)}–${ddmm(to)}${coupon}`;
  }

  private async tenantOf(
    payment: Payment,
    session: {
      tenantId?: Types.ObjectId;
      provision?: { tenantId?: Types.ObjectId };
    } | null,
  ): Promise<Tenant | null> {
    const id =
      payment.tenantId ?? session?.tenantId ?? session?.provision?.tenantId;
    const tenant = id
      ? await this.tenants.findById(id).exec()
      : payment.mpPreapprovalId
        ? await this.tenants
            .findOne({
              'subscription.mpPreapprovalId': payment.mpPreapprovalId,
            })
            .exec()
        : null;
    if (tenant && !payment.tenantId)
      await this.payments
        .updateOne({ _id: payment._id }, { $set: { tenantId: tenant._id } })
        .exec();
    return tenant;
  }

  /** Manda el correo del comprobante si aún no salió (reenvío desde HU57). */
  emailReceipt(id: Types.ObjectId, kind: Kind) {
    return this.sendEmail(id, kind);
  }

  /** Correo con el PDF y el XML (C2); una sola vez por comprobante (HU50). */
  private async sendEmail(id: Types.ObjectId, kind: Kind) {
    const p = await this.payments.findById(id).exec();
    const doc = kind === 'creditNote' ? p?.receipt?.creditNote : p?.receipt;
    if (!p || !doc) return;
    const to = await this.recipients(p);
    if (!to.length) return;
    const sent = await this.mailer.send({
      key: `receipt:${String(id)}:${kind}`,
      type: kind === 'creditNote' ? 'credit_note' : 'receipt',
      to,
      tenantId: p.tenantId,
      paymentId: p.providerPaymentId,
      content: T.receipt({
        kind:
          doc.type === '01'
            ? 'factura'
            : doc.type === '07'
              ? 'nota de crédito'
              : 'boleta',
        code: `${doc.series}-${doc.number}`,
        amount: p.amount,
        currency: p.currency,
        pdfUrl: doc.pdfUrl,
        xmlUrl: doc.xmlUrl,
      }),
    });
    if (sent || (await this.mailer.wasSent(`receipt:${String(id)}:${kind}`)))
      await this.payments
        .updateOne(
          { _id: id },
          { $set: { [`${this.path(kind)}.emailedAt`]: new Date() } },
        )
        .exec();
  }

  /** Correo de facturación o del comprador; si no, administrador + facturación de la empresa. */
  private async recipients(p: Payment): Promise<string[]> {
    const session = p.externalReference
      ? await this.sessions
          .findOne({ publicId: p.externalReference })
          .lean()
          .exec()
      : null;
    const billing = session?.billing as Billing | undefined;
    // Al comprador (que es el administrador) y copia al correo de facturación;
    // si ya hay empresa, también a su administrador y facturación actuales.
    const fromTenant = p.tenantId
      ? await this.mailer.recipients(p.tenantId)
      : [];
    if (session)
      return [session.buyer.email, billing?.email ?? '', ...fromTenant];
    if (fromTenant.length) return fromTenant;
    const one = await this.recipient(p);
    return one ? [one] : [];
  }

  private async recipient(p: Payment): Promise<string | undefined> {
    const session = p.externalReference
      ? await this.sessions
          .findOne({ publicId: p.externalReference })
          .lean()
          .exec()
      : null;
    const billing = session?.billing as Billing | undefined;
    if (billing?.email) return billing.email;
    if (session?.buyer.email) return session.buyer.email;
    if (!p.tenantId) return undefined;
    const tenant = await this.tenants.findById(p.tenantId).lean().exec();
    const info = (tenant as unknown as { billingInfo?: Billing } | null)
      ?.billingInfo;
    if (info?.email) return info.email;
    const admin = await this.users
      .findOne({ tenantId: p.tenantId, role: 'TENANT_ADMIN', isActive: true })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    return admin?.email ?? tenant?.email;
  }

  /** Cola del superadmin: comprobantes fallidos, pendientes o por facturar a mano. */
  async queue(status: 'failed' | 'pending' | 'manual' = 'failed') {
    return this.payments
      .find({
        $or: [
          { 'receipt.status': status },
          { 'receipt.creditNote.status': status },
        ],
      })
      .sort({ paidAt: -1 })
      .limit(200)
      .select(
        'tenantId concept amount currency paidAt receipt providerPaymentId',
      )
      .lean()
      .exec();
  }

  /**
   * El superadmin emitió el comprobante fuera de Maya (HU75): deja el pago
   * como "No aplica" con la referencia, y sale de la lista por facturar.
   */
  async markInvoiced(paymentId: string, reference?: string): Promise<void> {
    if (!Types.ObjectId.isValid(paymentId)) throw new NotFoundException();
    const ref = (reference ?? '').trim().slice(0, 40);
    const res = await this.payments
      .updateOne(
        { _id: new Types.ObjectId(paymentId), 'receipt.status': 'manual' },
        {
          $set: {
            'receipt.status': 'skipped',
            'receipt.skippedReason': ref
              ? `Facturado a mano: ${ref}`
              : 'Facturado a mano',
          },
        },
      )
      .exec();
    if (!res.matchedCount)
      throw new BadRequestException('Este pago no está por facturar');
  }

  /** Reintento manual: solo lo fallido vuelve a la cola, con intentos a cero (H3). */
  async retry(paymentId: string): Promise<void> {
    if (!Types.ObjectId.isValid(paymentId)) throw new NotFoundException();
    const p = await this.payments.findById(paymentId).exec();
    if (!p?.receipt) throw new NotFoundException('Pago sin comprobante');
    const kinds: Kind[] = [];
    if (p.receipt.status === 'failed') kinds.push('receipt');
    if (p.receipt.creditNote?.status === 'failed') kinds.push('creditNote');
    if (!kinds.length)
      throw new BadRequestException('Este comprobante no está fallido');
    for (const kind of kinds) {
      const path = this.path(kind);
      await this.payments
        .updateOne(
          { _id: p._id, [`${path}.status`]: 'failed' },
          {
            $set: { [`${path}.status`]: 'pending', [`${path}.attempts`]: 0 },
            $unset: {
              [`${path}.nextAttemptAt`]: '',
              [`${path}.lockedUntil`]: '',
            },
          },
        )
        .exec();
      await this.processOne(p._id, kind);
    }
  }
}
