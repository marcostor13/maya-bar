import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHmac, randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { SecretBox } from '../shared/secret-box';
import { assertPublicHost } from '../shared/network';
import { Conversation } from '../conversations/conversation.schema';
import { Message } from '../conversations/message.schema';
import {
  MessageEvents,
  type MessageEventKind,
} from '../conversations/message-events';
import {
  ApiAccess,
  ApiSmsMessage,
  ApiWebhookDelivery,
  type WebhookEvent,
} from './api-access.schema';

/** Espera antes de cada reintento: 1 min, 5 min, 30 min, 2 h y 6 h. */
export const WEBHOOK_BACKOFF_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 3600_000,
  6 * 3600_000,
];
export const WEBHOOK_MAX_ATTEMPTS = WEBHOOK_BACKOFF_MS.length + 1;
const TIMEOUT_MS = 10_000;
/** Mientras un intento está en curso, nadie más lo toma. */
const CLAIM_MS = 2 * 60_000;
const SWEEP_BATCH = 50;
const STATUS_EVENTS: Record<string, WebhookEvent> = {
  sent: 'message.sent',
  delivered: 'message.delivered',
  read: 'message.read',
  failed: 'message.failed',
};

/** `sha256=` + HMAC-SHA256(secreto, `<timestamp>.<cuerpo>`) en hex. */
export function signWebhook(
  secret: string,
  timestamp: string,
  body: string,
): string {
  return (
    'sha256=' +
    createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  );
}

export interface WebhookDeliveryView {
  _id: string;
  event: WebhookEvent;
  status: string;
  attempts: number;
  lastStatus?: number;
  lastError?: string;
  nextAttemptAt?: Date;
  deliveredAt?: Date;
  createdAt?: Date;
}

export interface WebhookPostResult {
  status: number;
}

/**
 * Webhook de salida de la API de integraciones (HU15): avisa a la URL de la
 * empresa cuando cambia un mensaje enviado por un acceso o el contacto responde.
 * Bandeja de salida en Mongo con reintentos de espera creciente.
 */
@Injectable()
export class ApiWebhookService implements OnModuleInit {
  private readonly logger = new Logger(ApiWebhookService.name);
  private readonly box: SecretBox;

  constructor(
    @InjectModel(ApiAccess.name) private accessModel: Model<ApiAccess>,
    @InjectModel(ApiWebhookDelivery.name)
    private deliveries: Model<ApiWebhookDelivery>,
    @InjectModel(Conversation.name) private convModel: Model<Conversation>,
    @InjectModel(Message.name) private msgModel: Model<Message>,
    private events: MessageEvents,
    config: ConfigService,
  ) {
    this.box = new SecretBox(
      config.get<string>('EMAIL_ENCRYPTION_KEY') ||
        config.getOrThrow<string>('JWT_SECRET'),
    );
  }

  onModuleInit() {
    this.events.on((kind, tenantId, msg) => {
      this.onMessage(kind, tenantId, msg).catch((err) =>
        this.logger.error(
          `No se pudo encolar el aviso del mensaje ${String(msg._id)}: ${String(err)}`,
        ),
      );
    });
  }

  // ------------------------------------------------------------------
  // Configuración (pantalla Integraciones)
  // ------------------------------------------------------------------

  /** Guarda la URL; si el acceso no tenía secreto, lo crea y lo devuelve una vez. */
  async setUrl(
    tenantId: string,
    id: string,
    rawUrl: string,
  ): Promise<{ webhookUrl: string; secret?: string }> {
    const access = await this.owned(tenantId, id);
    if (access.revokedAt)
      throw new ConflictException('El acceso está revocado.');
    const url = await this.checkUrl(rawUrl);
    let secret: string | undefined;
    if (!access.webhookSecret) {
      secret = this.newSecret();
      access.webhookSecret = this.box.encrypt(secret);
    }
    access.webhookUrl = url;
    await access.save();
    return { webhookUrl: url, secret };
  }

  async removeUrl(tenantId: string, id: string): Promise<{ removed: true }> {
    const access = await this.owned(tenantId, id);
    await this.accessModel
      .updateOne(
        { _id: access._id },
        { $unset: { webhookUrl: 1, webhookSecret: 1 } },
      )
      .exec();
    return { removed: true };
  }

  async rotateSecret(
    tenantId: string,
    id: string,
  ): Promise<{ secret: string }> {
    const access = await this.owned(tenantId, id);
    if (access.revokedAt)
      throw new ConflictException('El acceso está revocado.');
    if (!access.webhookUrl)
      throw new ConflictException('Primero guarda la URL de aviso.');
    const secret = this.newSecret();
    access.webhookSecret = this.box.encrypt(secret);
    await access.save();
    return { secret };
  }

  async sendTest(tenantId: string, id: string): Promise<WebhookDeliveryView> {
    const access = await this.owned(tenantId, id);
    if (!access.webhookUrl || access.revokedAt)
      throw new ConflictException('Primero guarda la URL de aviso.');
    const refId = new Types.ObjectId().toHexString();
    const delivery = await this.enqueue(access, 'ping', refId, {
      accessId: String(access._id),
      message: 'Aviso de prueba de Maya CRM',
    });
    if (!delivery) throw new ConflictException('No se pudo encolar la prueba');
    return this.view(delivery);
  }

  async list(tenantId: string, id: string): Promise<WebhookDeliveryView[]> {
    const access = await this.owned(tenantId, id);
    const docs = await this.deliveries
      .find({ accessId: access._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .exec();
    return docs.map((d) => this.view(d));
  }

  // ------------------------------------------------------------------
  // Eventos
  // ------------------------------------------------------------------

  async onMessage(
    kind: MessageEventKind,
    tenantId: string,
    msg: Message,
  ): Promise<void> {
    if (kind === 'updated' && msg.apiAccessId) {
      const event = STATUS_EVENTS[msg.status];
      if (!event) return;
      const access = await this.liveAccess(msg.apiAccessId);
      if (!access) return;
      const conv = await this.convOf(msg.conversationId);
      await this.enqueue(access, event, String(msg._id), {
        id: String(msg._id),
        status: msg.status,
        channel: conv?.channel,
        to: conv?.contact,
        conversationId: String(msg.conversationId),
        error: msg.status === 'failed' ? msg.error : undefined,
        at: msg.at,
      });
      return;
    }
    if (kind === 'created' && msg.direction === 'in') {
      // Solo las conversaciones donde un acceso escribió: no se filtra a la
      // integración el resto de chats de la cuenta.
      const ids = await this.msgModel
        .distinct('apiAccessId', {
          conversationId: msg.conversationId,
          apiAccessId: { $exists: true },
        })
        .exec();
      if (!ids.length) return;
      const conv = await this.convOf(msg.conversationId);
      for (const accessId of ids) {
        const access = await this.liveAccess(accessId);
        if (!access || String(access.tenantId) !== tenantId) continue;
        await this.enqueue(access, 'message.received', String(msg._id), {
          id: String(msg._id),
          conversationId: String(msg.conversationId),
          channel: conv?.channel,
          from: conv?.contact,
          type: msg.type,
          text: msg.text,
          at: msg.at,
        });
      }
    }
  }

  /** Aviso del resultado de un SMS enviado por la API (HU14). */
  async onSms(access: ApiAccess, sms: ApiSmsMessage): Promise<void> {
    const event = STATUS_EVENTS[sms.status];
    if (!event || !access.webhookUrl || access.revokedAt) return;
    await this.enqueue(access, event, String(sms._id), {
      id: String(sms._id),
      status: sms.status,
      channel: 'sms',
      to: sms.to,
      segments: sms.segments,
      error: sms.status === 'failed' ? sms.error : undefined,
      at: sms.at,
    });
  }

  // ------------------------------------------------------------------
  // Entrega
  // ------------------------------------------------------------------

  /** Encola y lanza el primer intento. `null` si ya existía (ack repetido). */
  async enqueue(
    access: ApiAccess,
    event: WebhookEvent,
    refId: string,
    data: Record<string, unknown>,
  ): Promise<ApiWebhookDelivery | null> {
    const _id = new Types.ObjectId();
    const createdAt = new Date();
    let delivery: ApiWebhookDelivery;
    try {
      delivery = await this.deliveries.create({
        _id,
        tenantId: access.tenantId,
        accessId: access._id,
        event,
        refId,
        payload: { id: String(_id), event, createdAt, data },
        nextAttemptAt: createdAt,
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return null;
      throw err;
    }
    this.attempt(delivery._id).catch((err) =>
      this.logger.error(`Aviso ${String(_id)}: ${String(err)}`),
    );
    return delivery;
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async sweep(): Promise<void> {
    const due = await this.deliveries
      .find({ status: 'pending', nextAttemptAt: { $lte: new Date() } })
      .sort({ nextAttemptAt: 1 })
      .limit(SWEEP_BATCH)
      .select('_id')
      .lean<{ _id: Types.ObjectId }[]>()
      .exec();
    for (const d of due) await this.attempt(d._id);
  }

  /** Un intento de entrega, si el aviso sigue pendiente y nadie lo tiene. */
  async attempt(id: Types.ObjectId, now = new Date()): Promise<void> {
    const delivery = await this.deliveries
      .findOneAndUpdate(
        { _id: id, status: 'pending', nextAttemptAt: { $lte: now } },
        { $set: { nextAttemptAt: new Date(now.getTime() + CLAIM_MS) } },
        { new: true },
      )
      .exec();
    if (!delivery) return;

    const access = await this.accessModel.findById(delivery.accessId).exec();
    if (!access?.webhookUrl || !access.webhookSecret || access.revokedAt) {
      delivery.status = 'failed';
      delivery.lastError = 'El acceso ya no tiene URL de aviso.';
      await delivery.save();
      return;
    }

    const body = JSON.stringify(delivery.payload);
    const timestamp = String(Math.floor(now.getTime() / 1000));
    let ok = false;
    try {
      await this.checkUrl(access.webhookUrl);
      const res = await this.post(access.webhookUrl, body, {
        'Content-Type': 'application/json',
        'User-Agent': 'MayaCRM-Webhooks/1',
        'X-Maya-Event': delivery.event,
        'X-Maya-Delivery': String(delivery._id),
        'X-Maya-Timestamp': timestamp,
        'X-Maya-Signature': signWebhook(
          this.box.decrypt(access.webhookSecret),
          timestamp,
          body,
        ),
      });
      delivery.lastStatus = res.status;
      ok = res.status >= 200 && res.status < 300;
      delivery.lastError = ok
        ? undefined
        : `Tu sistema respondió ${res.status}`;
    } catch (err) {
      delivery.lastError = err instanceof Error ? err.message : String(err);
    }

    delivery.attempts += 1;
    if (ok) {
      delivery.status = 'delivered';
      delivery.deliveredAt = new Date();
    } else if (delivery.attempts >= WEBHOOK_MAX_ATTEMPTS) {
      delivery.status = 'failed';
    } else {
      delivery.nextAttemptAt = new Date(
        now.getTime() + WEBHOOK_BACKOFF_MS[delivery.attempts - 1],
      );
    }
    await delivery.save();
    if (!ok)
      this.logger.warn(
        `Aviso ${String(delivery._id)} (acceso ${String(access._id)}) intento ${delivery.attempts}: ${delivery.lastError}`,
      );
  }

  /** POST con tiempo límite y sin seguir redirecciones (podrían ir a la red interna). */
  async post(
    url: string,
    body: string,
    headers: Record<string, string>,
  ): Promise<WebhookPostResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
        redirect: 'error',
      });
      return { status: res.status };
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      throw new Error(
        aborted
          ? 'Tu sistema no respondió en 10 s'
          : `No se pudo conectar con tu sistema: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  // ------------------------------------------------------------------

  private async checkUrl(raw: string): Promise<string> {
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      throw new BadRequestException('La URL de aviso no es válida.');
    }
    if (url.protocol !== 'https:')
      throw new BadRequestException('La URL de aviso debe ser https.');
    if (url.username || url.password)
      throw new BadRequestException(
        'La URL de aviso no puede llevar usuario ni contraseña.',
      );
    try {
      await assertPublicHost(url.hostname);
    } catch {
      throw new BadRequestException(
        'La URL de aviso no apunta a una dirección pública.',
      );
    }
    return url.toString();
  }

  private async liveAccess(id: Types.ObjectId): Promise<ApiAccess | null> {
    const access = await this.accessModel.findById(id).exec();
    return access?.webhookUrl && !access.revokedAt ? access : null;
  }

  private convOf(id: Types.ObjectId) {
    return this.convModel
      .findById(id)
      .select('contact channel')
      .lean<{ contact: string; channel: string }>()
      .exec();
  }

  private async owned(tenantId: string, id: string): Promise<ApiAccess> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Acceso no encontrado');
    const doc = await this.accessModel
      .findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
      })
      .exec();
    if (!doc) throw new NotFoundException('Acceso no encontrado');
    return doc;
  }

  private newSecret(): string {
    return 'whsec_' + randomBytes(24).toString('base64url');
  }

  private view(d: ApiWebhookDelivery): WebhookDeliveryView {
    return {
      _id: String(d._id),
      event: d.event,
      status: d.status,
      attempts: d.attempts,
      lastStatus: d.lastStatus,
      lastError: d.lastError,
      nextAttemptAt: d.status === 'pending' ? d.nextAttemptAt : undefined,
      deliveredAt: d.deliveredAt,
      createdAt: d.createdAt,
    };
  }
}
