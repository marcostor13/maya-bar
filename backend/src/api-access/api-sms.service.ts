import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SmsService } from '../sms/sms.service';
import { smsSegments } from '../sms/sms-segments';
import { SuppressionService } from '../suppression/suppression.service';
import { phoneDigits } from '../shared/phone';
import { ApiAccess, ApiSmsMessage } from './api-access.schema';
import { ApiAccessService } from './api-access.service';
import { maskContact } from './api-messages.service';
import { ApiWebhookService } from './api-webhook.service';
import { SendApiMessageDto } from './dto/api-access.dto';

const MAX_SMS_TEXT = 1600;
const MAX_IDEMPOTENCY_KEY = 128;

/**
 * Motivo del fallo sin la respuesta del proveedor: puede hacer eco de la
 * petición (usuario, clave, token) y saldría por la API pública.
 */
export function publicSmsError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.split(':')[0].trim().slice(0, 200) || 'Error del proveedor';
}

export interface ApiSmsView {
  id: string;
  status: string;
  channel: 'sms';
  to: string;
  segments: number;
  error?: string;
  createdAt: Date;
}

/** Envíos por SMS de la API de integraciones (HU14). */
@Injectable()
export class ApiSmsService {
  private readonly logger = new Logger(ApiSmsService.name);

  constructor(
    @InjectModel(ApiSmsMessage.name) private model: Model<ApiSmsMessage>,
    private accesses: ApiAccessService,
    private sms: SmsService,
    private suppression: SuppressionService,
    private webhooks: ApiWebhookService,
  ) {}

  async send(
    access: ApiAccess,
    dto: SendApiMessageDto,
    idempotencyKey?: string,
  ): Promise<{ message: ApiSmsView; duplicate: boolean }> {
    const key = idempotencyKey?.trim() || undefined;
    if (key && key.length > MAX_IDEMPOTENCY_KEY)
      throw new BadRequestException(
        `Idempotency-Key admite hasta ${MAX_IDEMPOTENCY_KEY} caracteres.`,
      );
    if (key) {
      const existing = await this.model
        .findOne({ accessId: access._id, idempotencyKey: key })
        .exec();
      if (existing) return { message: this.view(existing), duplicate: true };
    }

    const text = this.text(dto);
    const digits = phoneDigits(dto.to);
    if (!digits || digits.length < 8 || digits.length > 15)
      throw new BadRequestException(
        '"to" debe ser un número en formato internacional (p. ej. +51999888777).',
      );
    const to = `+${digits}`;

    await this.accesses.consumeQuota(access);
    await this.accesses.liveAccount(access);

    const tenantId = String(access.tenantId);
    if (await this.suppression.isSuppressed(tenantId, { phone: digits }))
      throw new UnprocessableEntityException(
        'El contacto está en la lista de "No contactar".',
      );

    let doc: ApiSmsMessage;
    try {
      doc = await this.model.create({
        tenantId: access.tenantId,
        accessId: access._id,
        accessName: access.name,
        to,
        text,
        segments: smsSegments(text),
        status: 'pending',
        idempotencyKey: key,
        at: new Date(),
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000 && key) {
        const existing = await this.model
          .findOne({ accessId: access._id, idempotencyKey: key })
          .exec();
        if (existing) return { message: this.view(existing), duplicate: true };
      }
      throw err;
    }

    try {
      const cfg = await this.sms.requireConfig(tenantId);
      const result = await this.sms.dispatch(cfg, to, text);
      doc.status = 'sent';
      doc.providerId = result.id;
    } catch (err) {
      doc.status = 'failed';
      doc.error = publicSmsError(err);
    }
    await doc.save();
    await this.accesses.markUsed(access);
    await this.webhooks
      .onSms(access, doc)
      .catch((err) =>
        this.logger.error(`Aviso del SMS ${String(doc._id)}: ${String(err)}`),
      );
    this.logger.log(
      `API ${String(access._id)} → sms ${maskContact(digits)}: ${doc.status}`,
    );
    return { message: this.view(doc), duplicate: false };
  }

  async status(access: ApiAccess, id: string): Promise<ApiSmsView> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Mensaje no encontrado');
    const doc = await this.model
      .findOne({ _id: new Types.ObjectId(id), accessId: access._id })
      .exec();
    if (!doc) throw new NotFoundException('Mensaje no encontrado');
    return this.view(doc);
  }

  private text(dto: SendApiMessageDto): string {
    if (dto.template)
      throw new BadRequestException('Las plantillas solo existen en WhatsApp.');
    if (dto.mediaUrl?.trim() || dto.mediaType)
      throw new BadRequestException('Por SMS solo se envía texto.');
    const text = dto.text?.trim() ?? '';
    if (!text) throw new BadRequestException('Falta "text".');
    if (text.length > MAX_SMS_TEXT)
      throw new BadRequestException(
        `Un SMS admite hasta ${MAX_SMS_TEXT} caracteres.`,
      );
    return text;
  }

  private view(doc: ApiSmsMessage): ApiSmsView {
    return {
      id: String(doc._id),
      status: doc.status,
      channel: 'sms',
      to: doc.to,
      segments: doc.segments,
      error: doc.status === 'failed' ? doc.error : undefined,
      createdAt: doc.at,
    };
  }
}
