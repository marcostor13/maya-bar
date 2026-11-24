import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BillingEvent } from './billing-event.schema';
import { MercadoPagoClient } from './mercadopago/mercadopago.client';
import { PaymentsService } from './payments.service';
import { BillingHooks } from './billing-hooks.service';

const MAX_ATTEMPTS = 6;
const LOCK_MS = 2 * 60_000;
const HANDLED = [
  'payment',
  'subscription_preapproval',
  'subscription_authorized_payment',
];

export interface IncomingMpEvent {
  eventId?: string;
  type: string;
  action?: string;
  dataId: string;
  raw: Record<string, unknown>;
}

/**
 * Cola de notificaciones de pago (HU45). Se guarda el evento, se responde
 * 200 y el trabajo real (consultar la API y cambiar estados) corre aquí, con
 * reintentos si Mercado Pago o un suscriptor fallan.
 */
@Injectable()
export class BillingEventsService {
  private readonly logger = new Logger(BillingEventsService.name);
  private running = false;

  constructor(
    @InjectModel(BillingEvent.name) private events: Model<BillingEvent>,
    private mp: MercadoPagoClient,
    private payments: PaymentsService,
    private hooks: BillingHooks,
  ) {}

  /** Guarda el evento; devuelve null si ya existía (reenvío) o no nos interesa. */
  async enqueue(e: IncomingMpEvent): Promise<BillingEvent | null> {
    if (!HANDLED.includes(e.type)) return null;
    const eventId = e.eventId || `${e.type}:${e.dataId}:${e.action ?? ''}`;
    try {
      return await this.events.create({
        provider: 'mercadopago',
        eventId,
        type: e.type,
        action: e.action,
        dataId: e.dataId,
        raw: e.raw,
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return null;
      throw err;
    }
  }

  /** Procesa un evento: consulta el recurso en la API y propaga el cambio. */
  async process(candidate: BillingEvent): Promise<void> {
    // Se reclama de forma atómica: el webhook y el cron nunca lo trabajan a la vez.
    const now = new Date();
    const event = await this.events
      .findOneAndUpdate(
        {
          _id: candidate._id,
          $or: [
            { status: 'pending' },
            { status: 'processing', lockedUntil: { $lt: now } },
          ],
        },
        {
          $set: {
            status: 'processing',
            lockedUntil: new Date(now.getTime() + LOCK_MS),
          },
        },
        { new: true },
      )
      .exec();
    if (!event) return;
    try {
      switch (event.type) {
        case 'payment': {
          await this.payments.syncFromMp(
            await this.mp.getPayment(event.dataId),
          );
          break;
        }
        case 'subscription_authorized_payment': {
          const auth = await this.mp.getAuthorizedPayment(event.dataId);
          if (auth.payment?.id) {
            const mp = await this.mp.getPayment(auth.payment.id);
            await this.payments.syncFromMp({
              ...mp,
              preapproval_id: mp.preapproval_id ?? auth.preapproval_id,
            });
          }
          break;
        }
        case 'subscription_preapproval': {
          await this.hooks.emitPreapproval(
            await this.mp.getPreapproval(event.dataId),
          );
          break;
        }
      }
      event.status = 'processed';
      event.processedAt = new Date();
      event.error = undefined;
      event.lockedUntil = undefined;
    } catch (err) {
      event.attempts = (event.attempts ?? 0) + 1;
      event.error = String(err).slice(0, 500);
      event.status = event.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
      event.nextAttemptAt = new Date(Date.now() + 60_000 * 2 ** event.attempts);
      event.lockedUntil = undefined;
      this.logger.warn(
        `Evento de pago ${event.eventId} falló (intento ${event.attempts}): ${event.error}`,
      );
    }
    await event.save();
  }

  /** Reintenta lo pendiente (y lo que entró y no se llegó a procesar). */
  @Cron(CronExpression.EVERY_MINUTE)
  async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.events
        .find({
          $or: [
            {
              status: 'pending',
              $or: [
                { nextAttemptAt: { $exists: false } },
                { nextAttemptAt: { $lte: new Date() } },
              ],
            },
            // Un proceso que murió a mitad: su candado venció.
            { status: 'processing', lockedUntil: { $lt: new Date() } },
          ],
        })
        .sort({ createdAt: 1 })
        .limit(50)
        .exec();
      for (const e of due) await this.process(e);
    } finally {
      this.running = false;
    }
  }
}
