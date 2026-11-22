import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation } from '../conversations/conversation.schema';
import { Message, MessageType } from '../conversations/message.schema';
import { ConversationsService } from '../conversations/conversations.service';
import { BlockedContactsService } from '../conversations/blocked-contacts.service';
import { SuppressionService } from '../suppression/suppression.service';
import { WaTemplate } from '../whatsapp-templates/wa-template.schema';
import {
  isHttps,
  resolveTemplateSend,
  type ResolvedTemplate,
} from '../whatsapp-templates/template-send';
import { WINDOW_MS } from '../conversations/wa-window';
import { phoneDigits } from '../shared/phone';
import { ApiAccess } from './api-access.schema';
import { ApiAccessService } from './api-access.service';
import { SendApiMessageDto } from './dto/api-access.dto';

const MAX_IDEMPOTENCY_KEY = 128;

/** Lo que ve quien consume la API de un mensaje. */
export interface ApiMessageView {
  id: string;
  status: string;
  channel: string;
  to: string;
  conversationId: string;
  error?: string;
  createdAt: Date;
}

/** `51999888777` → `51*****8777`: el log no guarda el destinatario completo. */
export function maskContact(contact: string): string {
  if (contact.length <= 6) return '***';
  return `${contact.slice(0, 2)}${'*'.repeat(contact.length - 6)}${contact.slice(-4)}`;
}

export {
  templateVariableCount,
  renderTemplate,
} from '../whatsapp-templates/template-send';

/**
 * Envíos de la API de integraciones (HU13). Valida todo lo que Meta o las
 * reglas de la plataforma rechazarían ANTES de tocar el canal, para devolver
 * un error claro en vez de un "fallido" en la bandeja.
 */
@Injectable()
export class ApiMessagesService {
  private readonly logger = new Logger(ApiMessagesService.name);

  constructor(
    @InjectModel(Conversation.name) private convModel: Model<Conversation>,
    @InjectModel(Message.name) private msgModel: Model<Message>,
    @InjectModel(WaTemplate.name) private templateModel: Model<WaTemplate>,
    private accesses: ApiAccessService,
    private conversations: ConversationsService,
    private blocked: BlockedContactsService,
    private suppression: SuppressionService,
  ) {}

  async send(
    access: ApiAccess,
    dto: SendApiMessageDto,
    idempotencyKey?: string,
  ): Promise<{ message: ApiMessageView; duplicate: boolean }> {
    const key = idempotencyKey?.trim() || undefined;
    if (key && key.length > MAX_IDEMPOTENCY_KEY)
      throw new BadRequestException(
        `Idempotency-Key admite hasta ${MAX_IDEMPOTENCY_KEY} caracteres.`,
      );
    if (key) {
      const existing = await this.msgModel
        .findOne({ apiAccessId: access._id, apiIdempotencyKey: key })
        .exec();
      if (existing)
        return {
          message: await this.viewOf(existing, access),
          duplicate: true,
        };
    }

    if (access.channel === 'sms')
      throw new BadRequestException('Los SMS los envía ApiSmsService.');
    const channel = access.channel;
    const content = this.content(access, dto);
    const contact = this.recipient(access, dto.to);

    await this.accesses.consumeQuota(access);
    await this.accesses.liveAccount(access);

    const tenantId = String(access.tenantId);
    if (await this.blocked.isBlocked(tenantId, channel, contact))
      throw new UnprocessableEntityException(
        'El contacto está bloqueado en la plataforma.',
      );
    if (
      access.channel === 'whatsapp' &&
      (await this.suppression.isSuppressed(tenantId, { phone: contact }))
    )
      throw new UnprocessableEntityException(
        'El contacto está en la lista de "No contactar".',
      );

    const conv = await this.convModel
      .findOne({
        channel: access.channel,
        accountId: access.accountId,
        contact,
      })
      .exec();
    if (conv?.blocked)
      throw new UnprocessableEntityException(
        'El contacto está bloqueado en la plataforma.',
      );

    let template:
      | Awaited<ReturnType<ApiMessagesService['resolveTemplate']>>
      | undefined;
    if (dto.template) {
      template = await this.resolveTemplate(access, dto);
    } else if (!(await this.windowOpen(conv))) {
      throw new UnprocessableEntityException(
        access.channel === 'whatsapp'
          ? 'El contacto no te escribió en las últimas 24 h: WhatsApp solo permite enviarle una plantilla aprobada (campo "template").'
          : 'Solo puedes escribir a contactos que te escribieron por este canal en las últimas 24 h.',
      );
    }

    const { conversation, message, duplicate } =
      await this.conversations.sendExternal({
        tenantId,
        channel,
        accountId: String(access.accountId),
        contact,
        type: template ? 'text' : content.type,
        text: template ? template.text : content.text,
        mediaUrl: template ? undefined : content.mediaUrl,
        filename: template ? undefined : dto.filename?.trim() || undefined,
        template: template?.send,
        api: {
          accessId: access._id,
          accessName: access.name,
          idempotencyKey: key,
        },
      });

    if (!duplicate) await this.accesses.markUsed(access);
    this.logger.log(
      `API ${String(access._id)} → ${access.channel} ${String(access.accountId)} ${maskContact(contact)}: ${message.status}`,
    );
    return { message: this.view(message, access, conversation), duplicate };
  }

  async status(access: ApiAccess, id: string): Promise<ApiMessageView> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Mensaje no encontrado');
    const msg = await this.msgModel
      .findOne({ _id: new Types.ObjectId(id), apiAccessId: access._id })
      .exec();
    if (!msg) throw new NotFoundException('Mensaje no encontrado');
    return this.viewOf(msg, access);
  }

  // ------------------------------------------------------------------

  /** Tipo, texto y archivo del mensaje (cuando no es plantilla). */
  private content(
    access: ApiAccess,
    dto: SendApiMessageDto,
  ): { type: MessageType; text: string; mediaUrl?: string } {
    const text = dto.text?.trim() ?? '';
    const mediaUrl = dto.mediaUrl?.trim() || undefined;
    if (dto.template) {
      if (access.channel !== 'whatsapp')
        throw new BadRequestException(
          'Las plantillas solo existen en WhatsApp.',
        );
      if (text || mediaUrl)
        throw new BadRequestException(
          'Con "template" no se envían "text" ni "mediaUrl": el contenido es el de la plantilla.',
        );
      return { type: 'text', text: '' };
    }
    if (mediaUrl) {
      if (!isHttps(mediaUrl))
        throw new BadRequestException('"mediaUrl" debe ser una URL https.');
      return { type: dto.mediaType ?? 'document', text, mediaUrl };
    }
    if (dto.mediaType)
      throw new BadRequestException('"mediaType" requiere "mediaUrl".');
    if (!text)
      throw new BadRequestException(
        'Falta el contenido: envía "text", "mediaUrl" o "template".',
      );
    return { type: 'text', text };
  }

  private recipient(access: ApiAccess, to: string): string {
    if (access.channel === 'whatsapp') {
      const digits = phoneDigits(to);
      if (!digits)
        throw new BadRequestException(
          '"to" debe ser un número de WhatsApp en formato internacional (p. ej. +51999888777).',
        );
      return digits;
    }
    const id = to.trim();
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(id))
      throw new BadRequestException(
        '"to" debe ser el id del contacto en este canal.',
      );
    return id;
  }

  private async windowOpen(conv: Conversation | null): Promise<boolean> {
    if (!conv) return false;
    const last = await this.msgModel
      .findOne({ conversationId: conv._id, direction: 'in' })
      .sort({ at: -1 })
      .select('at')
      .lean<{ at: Date }>()
      .exec();
    return !!last && Date.now() - new Date(last.at).getTime() < WINDOW_MS;
  }

  private async resolveTemplate(
    access: ApiAccess,
    dto: SendApiMessageDto,
  ): Promise<ResolvedTemplate> {
    const req = dto.template!;
    const filter: Record<string, unknown> = {
      tenantId: access.tenantId,
      accountId: access.accountId,
      name: req.name.trim(),
    };
    if (req.language?.trim()) filter.language = req.language.trim();
    const template = await this.templateModel.findOne(filter).exec();
    if (!template)
      throw new UnprocessableEntityException(
        `No existe la plantilla "${req.name}" en esta cuenta de WhatsApp.`,
      );
    return resolveTemplateSend(template, req);
  }

  private async viewOf(msg: Message, access: ApiAccess) {
    const conv = await this.convModel
      .findById(msg.conversationId)
      .select('contact')
      .lean<{ _id: Types.ObjectId; contact: string }>()
      .exec();
    return this.view(msg, access, {
      _id: msg.conversationId,
      contact: conv?.contact ?? '',
    });
  }

  private view(
    msg: Message,
    access: ApiAccess,
    conv: { _id: unknown; contact: string },
  ): ApiMessageView {
    return {
      id: String(msg._id),
      status: msg.status,
      channel: access.channel,
      to: conv.contact,
      conversationId: String(conv._id),
      error: msg.status === 'failed' ? msg.error : undefined,
      createdAt: msg.at,
    };
  }
}
