import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model, Types } from 'mongoose';
import { MetaCapiEvent } from './meta-capi-event.schema';
import { Tenant } from '../tenants/tenant.schema';
import { Payment } from '../billing/payment.schema';
import { phoneDigits } from '../shared/phone';

const GRAPH_URL = 'https://graph.facebook.com/v23.0';
/** Intentos: 1 min, 2, 4, 8 y 16; al sexto fallo se da por perdido. */
const MAX_ATTEMPTS = 6;
const RETRY_BASE_MS = 60_000;
const SEND_TIMEOUT_MS = 15_000;
const BATCH = 20;
/** Meta rechaza eventos de más de 7 días; los pagos se barren con margen. */
const PAYMENT_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;

export const registrationEventId = (tenantId: string) => `reg_${tenantId}`;
export const paymentEventId = (paymentId: string) => `pay_${paymentId}`;

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/**
 * API de conversiones de Meta para la publicidad propia de Maya CRM (HU84).
 *
 * Manda `CompleteRegistration` al confirmar el correo y `Purchase` por cada
 * pago aprobado. Los pagos no se enganchan al flujo de cobro: un barrido lee
 * `payments`, así un fallo de Meta nunca toca la facturación.
 *
 * Solo se envía si la empresa aceptó las cookies de medición al registrarse
 * (`tenant.acquisition.consent`). Sin `META_PIXEL_ID` y `META_CAPI_TOKEN` no
 * se registra nada (desarrollo y pruebas).
 */
@Injectable()
export class MetaCapiService {
  private readonly logger = new Logger(MetaCapiService.name);
  private readonly pixelId: string;
  private readonly token: string;
  private readonly testCode: string;
  private readonly siteUrl: string;
  private sweeping = false;

  constructor(
    @InjectModel(MetaCapiEvent.name) private events: Model<MetaCapiEvent>,
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
    @InjectModel(Payment.name) private payments: Model<Payment>,
    config: ConfigService,
  ) {
    this.pixelId = config.get<string>('META_PIXEL_ID') ?? '';
    this.token = config.get<string>('META_CAPI_TOKEN') ?? '';
    this.testCode = config.get<string>('META_TEST_EVENT_CODE') ?? '';
    this.siteUrl = (
      config.get<string>('FRONTEND_URL') ?? 'https://mayacrm.site'
    ).replace(/\/$/, '');
  }

  get enabled(): boolean {
    return !!this.pixelId && !!this.token;
  }

  /** Registro confirmado. Se llama sin `await`: el alta no depende de Meta. */
  async reportRegistration(tenantId: string): Promise<MetaCapiEvent | null> {
    try {
      if (!this.enabled) return null;
      const tenant = await this.tenants.findById(tenantId).lean<Tenant>();
      if (!tenant?.acquisition?.consent) return null;
      return await this.enqueue({
        eventId: registrationEventId(tenantId),
        eventName: 'CompleteRegistration',
        tenant,
        eventTime: new Date(),
        sourceUrl: `${this.siteUrl}/register`,
        customData: {
          content_name: 'Registro',
          status: 'verified',
        },
      });
    } catch (err) {
      this.logger.error(`No se pudo reportar el registro: ${String(err)}`);
      return null;
    }
  }

  /** `user_data` de Meta: datos personales con SHA-256, señales técnicas sin hash. */
  userData(
    tenant: Pick<Tenant, 'email' | 'phone' | 'acquisition'> & { _id: unknown },
  ) {
    const a = tenant.acquisition;
    const data: Record<string, unknown> = {
      external_id: [sha256(String(tenant._id))],
    };
    const email = tenant.email?.trim().toLowerCase();
    if (email) data.em = [sha256(email)];
    let ph = phoneDigits(tenant.phone);
    if (ph && ph.length === 9) ph = `51${ph}`;
    if (ph) data.ph = [sha256(ph)];
    if (a?.fbc) data.fbc = a.fbc;
    if (a?.fbp) data.fbp = a.fbp;
    if (a?.ip) data.client_ip_address = a.ip;
    if (a?.userAgent) data.client_user_agent = a.userAgent;
    return data;
  }

  private async enqueue(e: {
    eventId: string;
    eventName: string;
    tenant: Tenant;
    eventTime: Date;
    sourceUrl: string;
    customData: Record<string, unknown>;
  }): Promise<MetaCapiEvent | null> {
    const payload = {
      event_name: e.eventName,
      event_time: Math.floor(e.eventTime.getTime() / 1000),
      event_id: e.eventId,
      action_source: 'website',
      event_source_url: e.sourceUrl,
      user_data: this.userData(e.tenant),
      custom_data: e.customData,
    };
    let doc: MetaCapiEvent;
    try {
      doc = await this.events.create({
        eventId: e.eventId,
        eventName: e.eventName,
        tenantId: new Types.ObjectId(String(e.tenant._id)),
        payload,
        // El primer envío lo hace esta llamada; el cron solo lo retoma si falla
        // o si el proceso se cae a medias, así no se envía dos veces.
        nextAttemptAt: new Date(Date.now() + RETRY_BASE_MS),
      });
    } catch (err) {
      // Clave duplicada: ese hecho ya se había reportado.
      if ((err as { code?: number }).code === 11000) return null;
      throw err;
    }
    await this.deliver(doc);
    return doc;
  }

  /** Un intento de envío; deja el evento como enviado o con su próximo intento. */
  async deliver(doc: MetaCapiEvent): Promise<boolean> {
    let error = '';
    try {
      const body: Record<string, unknown> = {
        data: [doc.payload],
        access_token: this.token,
      };
      if (this.testCode) body.test_event_code = this.testCode;
      const res = await fetch(`${GRAPH_URL}/${this.pixelId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (res.ok) {
        await this.events.updateOne(
          { _id: doc._id },
          {
            $set: { status: 'sent', sentAt: new Date() },
            $unset: { nextAttemptAt: 1, lastError: 1 },
          },
        );
        return true;
      }
      error = `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
    } catch (err) {
      error = String(err);
    }
    const attempts = (doc.attempts ?? 0) + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    await this.events.updateOne(
      { _id: doc._id },
      {
        $set: {
          attempts,
          lastError: error,
          status: failed ? 'failed' : 'pending',
          ...(failed
            ? {}
            : {
                nextAttemptAt: new Date(
                  Date.now() + RETRY_BASE_MS * 2 ** (attempts - 1),
                ),
              }),
        },
        ...(failed ? { $unset: { nextAttemptAt: 1 } } : {}),
      },
    );
    this.logger.warn(
      `CAPI ${doc.eventName} ${doc.eventId} intento ${attempts}: ${error}`,
    );
    return false;
  }

  /** Pagos aprobados de los últimos días que aún no salieron como `Purchase`. */
  async sweepPayments(now = new Date()): Promise<number> {
    if (!this.enabled) return 0;
    const pays = await this.payments
      .find({
        status: 'approved',
        tenantId: { $exists: true, $ne: null },
        amount: { $gt: 0 },
        paidAt: { $gte: new Date(now.getTime() - PAYMENT_LOOKBACK_MS) },
      })
      .select('_id tenantId amount currency paidAt concept kind')
      .lean<Payment[]>();
    if (!pays.length) return 0;

    const ids = pays.map((p) => paymentEventId(String(p._id)));
    const done = new Set(
      (
        await this.events
          .find({ eventId: { $in: ids } })
          .select('eventId')
          .lean<{ eventId: string }[]>()
      ).map((d) => d.eventId),
    );
    let sent = 0;
    for (const p of pays) {
      const eventId = paymentEventId(String(p._id));
      if (done.has(eventId)) continue;
      const tenant = await this.tenants.findById(p.tenantId).lean<Tenant>();
      if (!tenant?.acquisition?.consent) continue;
      const doc = await this.enqueue({
        eventId,
        eventName: 'Purchase',
        tenant,
        eventTime: p.paidAt,
        sourceUrl: `${this.siteUrl}/settings/plan`,
        customData: {
          value: p.amount,
          currency: p.currency || 'PEN',
          content_name: p.concept,
          content_category: p.kind ?? 'plan',
        },
      });
      if (doc) sent++;
    }
    return sent;
  }

  /** Reintentos pendientes y barrido de pagos. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep(): Promise<void> {
    if (!this.enabled || this.sweeping) return;
    this.sweeping = true;
    try {
      const due = await this.events
        .find({ status: 'pending', nextAttemptAt: { $lte: new Date() } })
        .sort({ nextAttemptAt: 1 })
        .limit(BATCH);
      for (const d of due) await this.deliver(d);
      await this.sweepPayments();
    } catch (err) {
      this.logger.error(`Barrido CAPI: ${String(err)}`);
    } finally {
      this.sweeping = false;
    }
  }
}
