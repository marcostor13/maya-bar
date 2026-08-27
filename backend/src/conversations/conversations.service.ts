import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type QueryFilter } from 'mongoose';
import { Conversation, ConversationChannel } from './conversation.schema';
import { Message, MessageType, MessageStatus } from './message.schema';
import { SendMessageDto } from './dto/conversation.dto';
import {
  WhatsAppService,
  WaConfig,
  WaMediaType,
} from '../whatsapp/whatsapp.service';
import { InstagramService, IgConfig } from '../instagram/instagram.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { InstagramAccountsService } from '../instagram-accounts/instagram-accounts.service';
import { WhatsAppAccount } from '../whatsapp-accounts/whatsapp-account.schema';
import { InstagramAccount } from '../instagram-accounts/instagram-account.schema';
import { AiAgentsService } from '../ai-agents/ai-agents.service';
import { AiAgent } from '../ai-agents/ai-agent.schema';
import { UploadService } from '../upload/upload.service';
import { ConversationsGateway } from './conversations.gateway';

/** Historial que se le pasa al agente IA en cada respuesta. */
const AI_HISTORY_LIMIT = 20;
const DEFAULT_PAGE_SIZE = 50;

/** Cuenta conectada tal como la consume el selector de la bandeja de entrada. */
export interface InboxAccount {
  _id: string;
  channel: ConversationChannel;
  label: string;
  detail: string;
  active: boolean;
  isDefault: boolean;
  /** Conversaciones de esta cuenta, para que el selector sea informativo. */
  total: number;
  unread: number;
}

/** Turno del historial tal como lo espera AiAgentsService.generateAnswer. */
interface AiHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Media entrante todavía sin descargar. */
export interface InboundMedia {
  /** Cloud API: id de media a resolver contra Graph. */
  cloudMediaId?: string;
  /** WAHA / Instagram: URL directa de descarga. */
  downloadUrl?: string;
  mimeType?: string;
  filename?: string;
}

/** Mensaje entrante ya normalizado por el webhook del proveedor. */
export interface InboundMessage {
  contact: string;
  chatId?: string;
  contactName?: string;
  externalId?: string;
  type: MessageType;
  text?: string;
  media?: InboundMedia;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  at?: Date;
  /** true cuando el mensaje lo envió el negocio desde su propio móvil. */
  fromMe?: boolean;
}

const PREVIEW_BY_TYPE: Record<MessageType, string> = {
  text: 'Mensaje',
  image: '📷 Foto',
  video: '🎥 Video',
  audio: '🎵 Audio',
  voice: '🎤 Nota de voz',
  document: '📄 Documento',
  sticker: '🌟 Sticker',
  location: '📍 Ubicación',
  contact: '👤 Contacto',
  unsupported: 'Mensaje no soportado',
};

/** Descripción textual del adjunto para que el agente IA sepa qué recibió. */
const AI_HINT_BY_TYPE: Record<MessageType, string> = {
  text: '',
  image: '[El cliente envió una imagen]',
  video: '[El cliente envió un video]',
  audio: '[El cliente envió un audio]',
  voice: '[El cliente envió una nota de voz]',
  document: '[El cliente envió un documento]',
  sticker: '[El cliente envió un sticker]',
  location: '[El cliente compartió su ubicación]',
  contact: '[El cliente compartió un contacto]',
  unsupported: '[El cliente envió un mensaje que no se pudo interpretar]',
};

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @InjectModel(Conversation.name) private convModel: Model<Conversation>,
    @InjectModel(Message.name) private msgModel: Model<Message>,
    private wa: WhatsAppService,
    private ig: InstagramService,
    private waAccounts: WhatsAppAccountsService,
    private igAccounts: InstagramAccountsService,
    private agents: AiAgentsService,
    private uploads: UploadService,
    private gateway: ConversationsGateway,
  ) {}

  // ------------------------------------------------------------------
  // Consulta (bandeja de entrada)
  // ------------------------------------------------------------------

  /**
   * Cuentas conectadas del tenant (WhatsApp + Instagram) por las que puede
   * entrar una conversación. Sirve para el selector de cuenta de la bandeja.
   */
  async listAccounts(tenantId: string): Promise<InboxAccount[]> {
    const [wa, ig, counts] = await Promise.all([
      this.waAccounts.findAll(tenantId),
      this.igAccounts.findAll(tenantId),
      this.countsByAccount(tenantId),
    ]);

    const withCounts = (id: string) =>
      counts[id] ?? { total: 0, unread: 0 };

    return [
      ...wa.map((a) => ({
        _id: String(a._id),
        channel: 'whatsapp' as const,
        label: a.label,
        detail: a.phoneNumber || (a.provider === 'waha' ? 'WAHA' : 'Cloud API'),
        active: a.active,
        isDefault: !!a.isDefault,
        ...withCounts(String(a._id)),
      })),
      ...ig.map((a) => ({
        _id: String(a._id),
        channel: 'instagram' as const,
        label: a.label,
        detail: a.username ? `@${a.username}` : 'Instagram DM',
        active: a.active,
        isDefault: false,
        ...withCounts(String(a._id)),
      })),
    ];
  }

  /**
   * Cuántas conversaciones y cuántas sin leer tiene cada cuenta. Una sola
   * agregación en vez de una consulta por cuenta.
   */
  private async countsByAccount(
    tenantId: string,
  ): Promise<Record<string, { total: number; unread: number }>> {
    const rows = await this.convModel.aggregate<{
      _id: Types.ObjectId;
      total: number;
      unread: number;
    }>([
      { $match: { tenantId: new Types.ObjectId(tenantId) } },
      {
        $group: {
          _id: '$accountId',
          total: { $sum: 1 },
          unread: {
            $sum: { $cond: [{ $gt: ['$unreadCount', 0] }, 1, 0] },
          },
        },
      },
    ]);
    return Object.fromEntries(
      rows.map((r) => [String(r._id), { total: r.total, unread: r.unread }]),
    );
  }

  async listConversations(
    tenantId: string,
    filters: {
      channel?: string;
      accountId?: string;
      status?: string;
      q?: string;
      unread?: boolean;
    } = {},
  ) {
    const query: QueryFilter<Conversation> = {
      tenantId: new Types.ObjectId(tenantId),
    };
    if (filters.channel) query.channel = filters.channel as ConversationChannel;
    if (filters.accountId && Types.ObjectId.isValid(filters.accountId))
      query.accountId = new Types.ObjectId(filters.accountId);
    if (filters.status) query.status = filters.status;
    if (filters.unread) query.unreadCount = { $gt: 0 };
    if (filters.q) {
      const rx = new RegExp(
        filters.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      query.$or = [
        { contact: rx },
        { contactName: rx },
        { lastMessagePreview: rx },
      ];
    }
    return this.convModel
      .find(query)
      .sort({ lastMessageAt: -1 })
      .limit(200)
      .exec();
  }

  async getConversation(id: string, tenantId: string): Promise<Conversation> {
    const conv = await this.convModel
      .findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
      })
      .exec();
    if (!conv) throw new NotFoundException('Conversación no encontrada');
    return conv;
  }

  /** Página de mensajes en orden cronológico; `before` pagina hacia atrás. */
  async listMessages(
    id: string,
    tenantId: string,
    opts: { before?: string; limit?: number } = {},
  ) {
    await this.getConversation(id, tenantId);
    const query: QueryFilter<Message> = {
      conversationId: new Types.ObjectId(id),
    };
    if (opts.before) query.at = { $lt: new Date(opts.before) };
    const limit = Math.min(opts.limit ?? DEFAULT_PAGE_SIZE, 200);
    const docs = await this.msgModel
      .find(query)
      .sort({ at: -1 })
      .limit(limit)
      .exec();
    return docs.reverse();
  }

  async unreadTotal(tenantId: string) {
    const rows = await this.convModel.aggregate<{ total: number }>([
      {
        $match: {
          tenantId: new Types.ObjectId(tenantId),
          unreadCount: { $gt: 0 },
        },
      },
      { $group: { _id: null, total: { $sum: '$unreadCount' } } },
    ]);
    return { total: rows[0]?.total ?? 0 };
  }

  /** Marca la conversación como leída, también en el proveedor (doble check azul). */
  async markRead(id: string, tenantId: string) {
    const conv = await this.getConversation(id, tenantId);
    if (conv.unreadCount === 0) return conv;
    conv.unreadCount = 0;
    await conv.save();

    if (conv.channel === 'whatsapp') {
      const account = await this.waAccounts.findById(String(conv.accountId));
      if (account) {
        const last = await this.msgModel
          .findOne({
            conversationId: conv._id,
            direction: 'in',
            externalId: { $ne: null },
          })
          .sort({ at: -1 })
          .exec();
        await this.wa.markAsRead(this.waAccounts.toConfig(account), {
          chatId: conv.chatId,
          externalId: last?.externalId,
        });
      }
    }
    this.gateway.emitConversation(tenantId, conv);
    return conv;
  }

  /** Enciende/apaga la respuesta automática del agente para esta conversación. */
  async setAutoReply(
    id: string,
    tenantId: string,
    enabled: boolean,
    userId?: string,
  ) {
    const conv = await this.getConversation(id, tenantId);
    conv.autoReply = enabled;
    conv.takenOverBy = enabled
      ? undefined
      : userId
        ? new Types.ObjectId(userId)
        : undefined;
    conv.takenOverAt = enabled ? undefined : new Date();
    await conv.save();
    this.gateway.emitConversation(tenantId, conv);
    return conv;
  }

  async setStatus(id: string, tenantId: string, status: 'open' | 'closed') {
    const conv = await this.getConversation(id, tenantId);
    conv.status = status;
    await conv.save();
    this.gateway.emitConversation(tenantId, conv);
    return conv;
  }

  async remove(id: string, tenantId: string) {
    const conv = await this.getConversation(id, tenantId);
    await this.msgModel.deleteMany({ conversationId: conv._id }).exec();
    await this.convModel.deleteOne({ _id: conv._id }).exec();
    return { deleted: true };
  }

  // ------------------------------------------------------------------
  // Envío manual (operador humano)
  // ------------------------------------------------------------------

  async sendManual(
    id: string,
    tenantId: string,
    userId: string,
    dto: SendMessageDto,
  ) {
    const conv = await this.getConversation(id, tenantId);
    const type: MessageType = dto.type ?? (dto.mediaUrl ? 'document' : 'text');
    if (type === 'text' && !dto.text?.trim())
      throw new BadRequestException('El mensaje está vacío');
    if (type !== 'text' && !dto.mediaUrl)
      throw new BadRequestException('Falta la URL del archivo');

    // Escribir manualmente pausa al agente: quien contesta es la persona.
    if (conv.autoReply && dto.pauseAgent !== false) {
      conv.autoReply = false;
      conv.takenOverBy = new Types.ObjectId(userId);
      conv.takenOverAt = new Date();
    }

    const msg = await this.msgModel.create({
      tenantId: conv.tenantId,
      conversationId: conv._id,
      direction: 'out',
      author: 'human',
      type,
      text: dto.text ?? '',
      mediaUrl: dto.mediaUrl,
      mediaKey: dto.mediaKey,
      mimeType: dto.mimeType,
      filename: dto.filename,
      size: dto.size,
      durationSeconds: dto.durationSeconds,
      status: 'pending',
      sentBy: new Types.ObjectId(userId),
      at: new Date(),
    });

    await this.touchConversation(conv, msg);
    this.gateway.emitMessage(tenantId, msg);

    try {
      const externalId = await this.deliver(conv, msg);
      msg.status = 'sent';
      if (externalId) msg.externalId = externalId;
    } catch (err) {
      msg.status = 'failed';
      msg.error = String(err);
      this.logger.error(
        `Error enviando mensaje manual ${String(msg._id)}: ${String(err)}`,
      );
    }
    await msg.save();
    this.gateway.emitMessageUpdated(tenantId, msg);
    return msg;
  }

  /** Entrega el mensaje por el canal correspondiente y devuelve el id del proveedor. */
  private async deliver(
    conv: Conversation,
    msg: Message,
  ): Promise<string | undefined> {
    const mediaType = msg.mediaUrl
      ? this.toProviderMediaType(msg.type)
      : undefined;
    // El caption viaja como cuerpo; para documentos se usa el nombre si no hay texto.
    const body = msg.text || (msg.mediaUrl ? (msg.filename ?? '') : '');

    if (conv.channel === 'whatsapp') {
      const account = await this.waAccounts.findById(String(conv.accountId));
      if (!account) throw new Error('La cuenta de WhatsApp ya no existe');
      if (!account.active)
        throw new Error('La cuenta de WhatsApp está inactiva');
      const config: WaConfig = this.waAccounts.toConfig(account);
      return this.wa.sendMessage(
        conv.contact,
        body,
        config,
        msg.mediaUrl,
        mediaType,
      );
    }

    const igAccount = await this.igAccounts.findById(String(conv.accountId));
    if (!igAccount) throw new Error('La cuenta de Instagram ya no existe');
    const igConfig: IgConfig = this.igAccounts.toConfig(igAccount);
    await this.ig.sendMessage(
      conv.contact,
      body,
      igConfig,
      msg.mediaUrl,
      mediaType,
    );
    return undefined;
  }

  private toProviderMediaType(type: MessageType): WaMediaType {
    if (type === 'image' || type === 'sticker') return 'image';
    if (type === 'video') return 'video';
    if (type === 'audio' || type === 'voice') return 'audio';
    return 'document';
  }

  // ------------------------------------------------------------------
  // Entrada desde los webhooks
  // ------------------------------------------------------------------

  async handleWhatsAppInbound(
    account: WhatsAppAccount,
    inbound: InboundMessage,
  ) {
    const config = this.waAccounts.toConfig(account);
    await this.ingest({
      channel: 'whatsapp',
      tenantId: String(account.tenantId),
      accountId: String(account._id),
      inbound,
      downloadMedia: (media) => this.downloadWhatsAppMedia(media, config),
      resolveAgent: () =>
        this.agents.findPublishedByAccount(String(account._id)),
      typing: inbound.chatId
        ? (on: boolean) =>
            this.wa.setTyping(config, inbound.chatId as string, on)
        : undefined,
    });
  }

  async handleInstagramInbound(
    account: InstagramAccount,
    inbound: InboundMessage,
  ) {
    await this.ingest({
      channel: 'instagram',
      tenantId: String(account.tenantId),
      accountId: String(account._id),
      inbound,
      downloadMedia: (media) => this.downloadPublicMedia(media),
      resolveAgent: () =>
        this.agents.findPublishedByInstagramAccount(String(account._id)),
    });
  }

  /** Actualiza el estado de un mensaje saliente a partir del ack del proveedor. */
  async handleAck(externalId: string, status: MessageStatus) {
    if (!externalId) return;
    const msg = await this.msgModel.findOne({ externalId }).exec();
    if (!msg) return;
    const order: MessageStatus[] = ['pending', 'sent', 'delivered', 'read'];
    // Nunca retrocedas el estado (los acks pueden llegar desordenados).
    if (
      msg.status !== 'failed' &&
      order.indexOf(status) <= order.indexOf(msg.status)
    )
      return;
    msg.status = status;
    await msg.save();
    this.gateway.emitMessageUpdated(String(msg.tenantId), msg);
  }

  // ------------------------------------------------------------------
  // Núcleo de ingesta
  // ------------------------------------------------------------------

  private async ingest(params: {
    channel: ConversationChannel;
    tenantId: string;
    accountId: string;
    inbound: InboundMessage;
    downloadMedia: (
      media: InboundMedia,
    ) => Promise<{ buffer: Buffer; mimeType: string } | null>;
    resolveAgent: () => Promise<AiAgent | null>;
    typing?: (on: boolean) => Promise<void>;
  }) {
    const { channel, tenantId, accountId, inbound } = params;
    const conv = await this.upsertConversation(
      channel,
      tenantId,
      accountId,
      inbound,
    );

    // Eco de un mensaje que el negocio envió desde su propio móvil: solo se archiva.
    const isEcho = inbound.fromMe === true;
    if (isEcho && (await this.isDuplicateEcho(conv, inbound))) return;

    const media = inbound.media
      ? await this.storeInboundMedia(
          inbound.media,
          params.downloadMedia,
          channel,
        )
      : null;

    const msg = await this.msgModel.create({
      tenantId: conv.tenantId,
      conversationId: conv._id,
      direction: isEcho ? 'out' : 'in',
      author: isEcho ? 'human' : 'customer',
      type: inbound.type,
      text: inbound.text ?? '',
      mediaUrl: media?.url,
      mediaKey: media?.key,
      mimeType: media?.contentType ?? inbound.media?.mimeType,
      filename: inbound.media?.filename,
      size: media?.size,
      latitude: inbound.latitude,
      longitude: inbound.longitude,
      locationName: inbound.locationName,
      externalId: inbound.externalId,
      status: isEcho ? 'sent' : 'read',
      at: inbound.at ?? new Date(),
    });

    if (!isEcho) conv.unreadCount += 1;
    await this.touchConversation(conv, msg);
    this.gateway.emitMessage(tenantId, msg);

    if (isEcho) {
      // Contestaron desde el móvil: el agente se aparta para no pisar a la persona.
      if (conv.autoReply) {
        conv.autoReply = false;
        conv.takenOverAt = new Date();
        await conv.save();
        this.gateway.emitConversation(tenantId, conv);
      }
      return;
    }

    if (!conv.autoReply || conv.status === 'closed') return;
    await this.runAgent(conv, msg, params.resolveAgent, params.typing);
  }

  /** Genera y envía la respuesta del agente publicado para esta cuenta. */
  private async runAgent(
    conv: Conversation,
    inboundMsg: Message,
    resolveAgent: () => Promise<AiAgent | null>,
    typing?: (on: boolean) => Promise<void>,
  ) {
    const tenantId = String(conv.tenantId);
    const agent = await resolveAgent();
    if (!agent) {
      this.logger.warn(
        `Sin agente publicado para la cuenta ${String(conv.accountId)} — el chat queda en manual.`,
      );
      return;
    }

    const history = await this.buildAiHistory(conv, inboundMsg);
    const userMessage =
      this.toAiContent(inboundMsg) || AI_HINT_BY_TYPE.unsupported;

    if (typing) {
      await typing(true);
      this.gateway.emitTyping(tenantId, String(conv._id), true);
    }

    try {
      const { reply, filesToSend } = await this.agents.generateAnswer(
        agent,
        userMessage,
        history,
      );

      conv.agentId = agent._id;
      await conv.save();

      if (reply) {
        await this.sendFromAgent(conv, { type: 'text', text: reply });
      }
      for (const file of filesToSend) {
        await this.sendFromAgent(conv, {
          type: this.typeFromMime(file.contentType),
          text: file.name,
          mediaUrl: file.url,
          mimeType: file.contentType,
          filename: file.name,
        });
      }
    } catch (err) {
      this.logger.error(
        `Error generando la respuesta del agente: ${String(err)}`,
      );
    } finally {
      if (typing) {
        await typing(false);
        this.gateway.emitTyping(tenantId, String(conv._id), false);
      }
    }
  }

  /** Persiste y entrega un mensaje originado por el agente IA. */
  private async sendFromAgent(
    conv: Conversation,
    data: {
      type: MessageType;
      text: string;
      mediaUrl?: string;
      mimeType?: string;
      filename?: string;
    },
  ) {
    const msg = await this.msgModel.create({
      tenantId: conv.tenantId,
      conversationId: conv._id,
      direction: 'out',
      author: 'agent',
      type: data.type,
      text: data.text,
      mediaUrl: data.mediaUrl,
      mimeType: data.mimeType,
      filename: data.filename,
      status: 'pending',
      at: new Date(),
    });

    try {
      const externalId = await this.deliver(conv, msg);
      msg.status = 'sent';
      if (externalId) msg.externalId = externalId;
    } catch (err) {
      msg.status = 'failed';
      msg.error = String(err);
      this.logger.error(
        `Error enviando la respuesta del agente: ${String(err)}`,
      );
    }
    await msg.save();
    await this.touchConversation(conv, msg);
    this.gateway.emitMessage(String(conv.tenantId), msg);
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  /**
   * Los mensajes que enviamos por la API vuelven como eco del proveedor. Se descartan
   * por id; y si el ack llega antes de que hayamos guardado el id, por texto reciente.
   */
  private async isDuplicateEcho(
    conv: Conversation,
    inbound: InboundMessage,
  ): Promise<boolean> {
    if (inbound.externalId) {
      const byId = await this.msgModel
        .findOne({ externalId: inbound.externalId })
        .exec();
      if (byId) return true;
    }
    const since = new Date(Date.now() - 30_000);
    const recent = await this.msgModel
      .findOne({
        conversationId: conv._id,
        direction: 'out',
        text: inbound.text ?? '',
        at: { $gte: since },
      })
      .exec();
    return recent !== null;
  }

  private async upsertConversation(
    channel: ConversationChannel,
    tenantId: string,
    accountId: string,
    inbound: InboundMessage,
  ): Promise<Conversation> {
    const filter = {
      channel,
      accountId: new Types.ObjectId(accountId),
      contact: inbound.contact,
    };
    const existing = await this.convModel.findOne(filter).exec();
    if (existing) {
      if (inbound.contactName && inbound.contactName !== existing.contactName) {
        existing.contactName = inbound.contactName;
      }
      if (inbound.chatId && inbound.chatId !== existing.chatId)
        existing.chatId = inbound.chatId;
      return existing;
    }
    return this.convModel.create({
      ...filter,
      tenantId: new Types.ObjectId(tenantId),
      chatId: inbound.chatId,
      contactName: inbound.contactName,
      autoReply: true,
      status: 'open',
      unreadCount: 0,
      lastMessageAt: inbound.at ?? new Date(),
    });
  }

  private async touchConversation(conv: Conversation, msg: Message) {
    conv.lastMessageAt = msg.at;
    conv.lastMessagePreview = this.previewOf(msg);
    conv.lastMessageDirection = msg.direction;
    if (conv.status === 'closed' && msg.direction === 'in')
      conv.status = 'open';
    await conv.save();
    this.gateway.emitConversation(String(conv.tenantId), conv);
  }

  private previewOf(msg: Message): string {
    if (msg.type === 'text') return (msg.text ?? '').slice(0, 140);
    const label =
      msg.type === 'document' && msg.filename
        ? `📄 ${msg.filename}`
        : PREVIEW_BY_TYPE[msg.type];
    return msg.text ? `${label} · ${msg.text.slice(0, 100)}` : label;
  }

  private toAiContent(msg: Message): string {
    if (msg.type === 'text') return msg.text ?? '';
    if (msg.type === 'location') {
      const place = msg.locationName ? ` (${msg.locationName})` : '';
      return `${AI_HINT_BY_TYPE.location}${place}: ${msg.latitude}, ${msg.longitude}`;
    }
    const hint = AI_HINT_BY_TYPE[msg.type];
    return msg.text ? `${hint} con el texto: ${msg.text}` : hint;
  }

  /** Historial reciente en el formato que espera el agente (excluye el mensaje actual). */
  private async buildAiHistory(
    conv: Conversation,
    current: Message,
  ): Promise<AiHistoryTurn[]> {
    const docs = await this.msgModel
      .find({
        conversationId: conv._id,
        _id: { $ne: current._id },
        status: { $ne: 'failed' },
      })
      .sort({ at: -1 })
      .limit(AI_HISTORY_LIMIT)
      .exec();
    return docs
      .reverse()
      .map(
        (m): AiHistoryTurn => ({
          role: m.direction === 'in' ? 'user' : 'assistant',
          content: this.toAiContent(m),
        }),
      )
      .filter((m) => m.content.length > 0);
  }

  private typeFromMime(mime?: string): MessageType {
    if (!mime) return 'document';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'document';
  }

  /** Descarga la media entrante y la re-hospeda en S3 (las URLs del proveedor caducan). */
  private async storeInboundMedia(
    media: InboundMedia,
    download: (
      media: InboundMedia,
    ) => Promise<{ buffer: Buffer; mimeType: string } | null>,
    channel: ConversationChannel,
  ) {
    try {
      const file = await download(media);
      if (!file) return null;
      return await this.uploads.uploadBuffer(
        file.buffer,
        media.mimeType ?? file.mimeType,
        `${channel}-media`,
        media.filename,
      );
    } catch (err) {
      this.logger.error(
        `No se pudo re-hospedar la media entrante: ${String(err)}`,
      );
      return null;
    }
  }

  private downloadWhatsAppMedia(media: InboundMedia, config: WaConfig) {
    if (media.cloudMediaId)
      return this.wa.downloadCloudMedia(media.cloudMediaId, config);
    if (media.downloadUrl)
      return this.wa.downloadWahaMedia(media.downloadUrl, config);
    return Promise.resolve(null);
  }

  private async downloadPublicMedia(media: InboundMedia) {
    if (!media.downloadUrl) return null;
    try {
      const res = await fetch(media.downloadUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return {
        buffer: Buffer.from(await res.arrayBuffer()),
        mimeType: res.headers.get('content-type') ?? 'application/octet-stream',
      };
    } catch (err) {
      this.logger.error(
        `No se pudo descargar la media (${media.downloadUrl}): ${String(err)}`,
      );
      return null;
    }
  }
}
