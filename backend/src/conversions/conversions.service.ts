import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ConversionEvent,
  ConversionEventType,
  ConversionRefType,
} from './conversion-event.schema';
import { Conversation } from '../conversations/conversation.schema';
import { Customer } from '../customers/customer.schema';
import { hasAttribution, type AdReferral } from '../shared/ad-referral';
import { phoneDigits } from '../shared/phone';

/** Intentos antes de darlo por perdido: 1 min, 2, 4, 8, 16 y 32. */
const MAX_ATTEMPTS = 6;
const RETRY_BASE_MS = 60_000;
const SEND_TIMEOUT_MS = 15_000;
/** Cuántos pendientes se procesan por pasada. */
const BATCH = 20;
/** Reserva del intento mientras se envía, para que dos instancias no lo repitan. */
const LEASE_MS = 2 * 60_000;

export interface ReportConversionInput {
  tenantId: string | Types.ObjectId;
  event: ConversionEventType;
  refType: ConversionRefType;
  /** Id del objeto que la dispara. Junto a `event` y `refType`, deduplica. */
  refId: string;
  customerId?: string | Types.ObjectId;
  name?: string;
  phone?: string;
  email?: string;
  value?: number;
  currency?: string;
  notes?: string;
  occurredAt?: Date;
}

/** Oportunidad que acaba de cambiar de etapa, con lo justo para reportarla. */
export interface LeadStageChange {
  _id: Types.ObjectId | string;
  tenantId: Types.ObjectId | string;
  customerId?: Types.ObjectId | string;
  stage: string;
  value?: number;
  currency?: string;
  title?: string;
}

/** Etapa del embudo → conversión que se reporta al llegar a ella. */
const EVENT_BY_STAGE: Record<string, ConversionEventType | undefined> = {
  qualified: 'lead',
  won: 'purchase',
};

/**
 * Avisa al sistema de atribución (Ignia) cuando un chat que vino de un anuncio
 * se convierte en negocio: oportunidad calificada, reserva o venta.
 *
 * Existe porque un número de WhatsApp entrega sus mensajes a UNA sola
 * aplicación de Meta, y esa es Maya CRM. Ignia no puede escuchar el mismo
 * webhook sin dejar ciego al agente, así que Maya —que sí los recibe— guarda el
 * anuncio de origen de cada chat y le avisa cuando pasa algo que vale dinero.
 *
 * El evento se guarda en Mongo antes de salir a la red y se reintenta con
 * espera creciente: si Ignia está caída, la conversión no se pierde.
 */
@Injectable()
export class ConversionsService {
  private readonly logger = new Logger(ConversionsService.name);
  private readonly url: string;
  private readonly token: string;
  private sweeping = false;

  constructor(
    @InjectModel(ConversionEvent.name)
    private model: Model<ConversionEvent>,
    @InjectModel(Conversation.name)
    private convModel: Model<Conversation>,
    @InjectModel(Customer.name)
    private customerModel: Model<Customer>,
    config: ConfigService,
  ) {
    this.url = config.get<string>('CONVERSIONS_URL') ?? '';
    this.token = config.get<string>('CONVERSIONS_TOKEN') ?? '';
    if (!this.url)
      this.logger.log(
        'CONVERSIONS_URL no configurada: las conversiones se registran pero no se envían.',
      );
  }

  // ------------------------------------------------------------------
  // Registro
  // ------------------------------------------------------------------

  /**
   * Registra la conversión y la manda. Devuelve null cuando no hay nada que
   * atribuir (el cliente no vino de un anuncio) o cuando ya se había
   * reportado: en los dos casos no hay nada que hacer y no es un error.
   *
   * Se llama sin `await` desde el flujo de negocio: cobrar no puede fallar
   * porque el sistema de atribución esté caído.
   */
  async report(input: ReportConversionInput): Promise<ConversionEvent | null> {
    try {
      const resolved = await this.resolve(input);
      if (!resolved) return null;

      const doc = await this.model.create({
        tenantId: new Types.ObjectId(String(input.tenantId)),
        event: input.event,
        refType: input.refType,
        refId: input.refId,
        ctwaClid: resolved.referral.ctwaClid,
        adId: resolved.referral.adId,
        sourceUrl: resolved.referral.sourceUrl,
        contactName: resolved.name,
        phone: resolved.phone,
        email: resolved.email,
        value: input.value ?? 0,
        currency: input.currency || 'PEN',
        notes: input.notes,
        occurredAt: input.occurredAt ?? new Date(),
      });

      await this.deliver(doc);
      return doc;
    } catch (err) {
      // Clave duplicada: ya se había reportado ese mismo hecho de negocio.
      if ((err as { code?: number }).code === 11000) return null;
      this.logger.error(`No se pudo registrar la conversión: ${String(err)}`);
      return null;
    }
  }

  /** Traduce un movimiento del embudo a la conversión que le corresponde. */
  async reportLeadStage(lead: LeadStageChange, previousStage: string) {
    if (lead.stage === previousStage) return null;
    const event = EVENT_BY_STAGE[lead.stage];
    if (!event) return null;
    return this.report({
      tenantId: lead.tenantId,
      event,
      refType: 'lead',
      refId: String(lead._id),
      customerId: lead.customerId,
      value: lead.value,
      currency: lead.currency,
      notes: lead.title,
    });
  }

  /** Últimas conversiones del tenant, para ver qué se envió y qué falló. */
  list(tenantId: string, limit = 50) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 200))
      .exec();
  }

  // ------------------------------------------------------------------
  // Atribución
  // ------------------------------------------------------------------

  /**
   * Busca el anuncio del que salió este cliente: primero en su ficha, luego en
   * sus chats, y por último por teléfono (una reserva pública no trae contacto
   * del CRM, solo el número que dejó el cliente).
   *
   * Sin `ctwa_clid` no hay nada que atribuir: Meta no puede casar la conversión
   * con la campaña, así que no se manda nada.
   */
  private async resolve(input: ReportConversionInput): Promise<{
    referral: AdReferral;
    name?: string;
    phone?: string;
    email?: string;
  } | null> {
    const tenantId = new Types.ObjectId(String(input.tenantId));
    let referral: AdReferral | undefined;
    let { name, phone, email } = input;

    if (input.customerId) {
      const customer = await this.customerModel
        .findOne({
          _id: new Types.ObjectId(String(input.customerId)),
          tenantId,
        })
        .exec();
      if (customer) {
        referral = customer.adReferral;
        name ||= customer.name;
        phone ||= customer.phone;
        email ||= customer.email;
      }
    }

    if (!hasAttribution(referral) && input.customerId) {
      const conv = await this.convModel
        .findOne({
          tenantId,
          customerId: new Types.ObjectId(String(input.customerId)),
          'adReferral.ctwaClid': { $exists: true, $ne: '' },
        })
        .exec();
      referral = conv?.adReferral;
    }

    if (!hasAttribution(referral)) {
      const digits = phoneDigits(phone);
      if (digits) {
        const conv = await this.convModel
          .findOne({
            tenantId,
            channel: 'whatsapp',
            contact: digits,
            'adReferral.ctwaClid': { $exists: true, $ne: '' },
          })
          .exec();
        referral = conv?.adReferral;
      }
    }

    if (!hasAttribution(referral)) {
      this.logger.debug?.(
        `Conversión ${input.event} sin anuncio de origen (${input.refType} ${input.refId}): no se reporta.`,
      );
      return null;
    }
    return { referral: referral!, name, phone, email };
  }

  // ------------------------------------------------------------------
  // Entrega
  // ------------------------------------------------------------------

  /** Pasada periódica: reintenta lo que quedó pendiente. */
  @Cron(CronExpression.EVERY_MINUTE)
  sweep(): void {
    void this.flushPending();
  }

  async flushPending(): Promise<void> {
    if (!this.url || this.sweeping) return;
    this.sweeping = true;
    try {
      const now = new Date();
      const pending = await this.model
        .find({ status: 'pending', nextAttemptAt: { $lte: now } })
        .sort({ nextAttemptAt: 1 })
        .limit(BATCH)
        .exec();

      for (const doc of pending) {
        // Se reserva el intento antes de salir a la red: con dos instancias
        // levantadas, solo una se lleva cada evento.
        const claimed = await this.model
          .findOneAndUpdate(
            {
              _id: doc._id,
              status: 'pending',
              nextAttemptAt: { $lte: now },
            },
            { $set: { nextAttemptAt: new Date(Date.now() + LEASE_MS) } },
            { new: true },
          )
          .exec();
        if (claimed) await this.deliver(claimed);
      }
    } catch (err) {
      this.logger.error(`Error reintentando conversiones: ${String(err)}`);
    } finally {
      this.sweeping = false;
    }
  }

  private async deliver(doc: ConversionEvent): Promise<void> {
    if (!this.url) return;
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify(this.payload(doc)),
      });
      if (!res.ok)
        throw new Error(
          `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`,
        );

      doc.attempts += 1;
      doc.status = 'sent';
      doc.sentAt = new Date();
      doc.lastError = undefined;
      await doc.save();
      this.logger.log(
        `Conversión ${doc.event} reportada (${doc.refType} ${doc.refId}, ctwa_clid ${doc.ctwaClid ?? '—'}).`,
      );
    } catch (err) {
      doc.attempts += 1;
      doc.lastError = String(err).slice(0, 500);
      if (doc.attempts >= MAX_ATTEMPTS) {
        doc.status = 'failed';
        this.logger.error(
          `Conversión ${doc.event} (${doc.refType} ${doc.refId}) descartada tras ${doc.attempts} intentos: ${doc.lastError}`,
        );
      } else {
        doc.nextAttemptAt = new Date(
          Date.now() + RETRY_BASE_MS * 2 ** (doc.attempts - 1),
        );
        this.logger.warn(
          `Conversión ${doc.event} (${doc.refType} ${doc.refId}) falló, reintento ${doc.attempts}: ${doc.lastError}`,
        );
      }
      await doc.save();
    }
  }

  /**
   * Cuerpo que recibe el sistema de atribución. `event_id` permite deduplicar
   * del lado de Ignia si un reintento llega después de que el primero sí entró.
   */
  private payload(doc: ConversionEvent): Record<string, unknown> {
    return {
      event: doc.event,
      event_id: String(doc._id),
      event_time: doc.occurredAt.toISOString(),
      ctwa_clid: doc.ctwaClid,
      ad_id: doc.adId,
      source_url: doc.sourceUrl,
      contact: {
        name: doc.contactName,
        phone: doc.phone,
        email: doc.email,
      },
      value: doc.value,
      currency: doc.currency,
      notes: doc.notes,
      tenant_id: String(doc.tenantId),
      reference: { type: doc.refType, id: doc.refId },
    };
  }
}
