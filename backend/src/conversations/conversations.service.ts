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
import {
  SendMessageDto,
  SaveContactDto,
  SendToPipelineDto,
} from './dto/conversation.dto';
import {
  WhatsAppService,
  WaConfig,
  WaMediaType,
} from '../whatsapp/whatsapp.service';
import { InstagramService, IgConfig } from '../instagram/instagram.service';
import { MessengerService, MsConfig } from '../messenger/messenger.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { InstagramAccountsService } from '../instagram-accounts/instagram-accounts.service';
import { MessengerAccountsService } from '../messenger-accounts/messenger-accounts.service';
import { WhatsAppAccount } from '../whatsapp-accounts/whatsapp-account.schema';
import { InstagramAccount } from '../instagram-accounts/instagram-account.schema';
import { MessengerAccount } from '../messenger-accounts/messenger-account.schema';
import { EmailAccountsService } from '../email-accounts/email-accounts.service';
import { EmailTransportService } from '../email-accounts/email-transport.service';
import { EmailAccount } from '../email-accounts/email-account.schema';
import {
  type ParsedEmail,
  replySubject,
  textToHtml,
} from '../email-accounts/email-message';
import { AiAgentsService } from '../ai-agents/ai-agents.service';
import { formatLocal } from '../calendar/availability';
import { AiAgent } from '../ai-agents/ai-agent.schema';
import {
  MediaUnderstandingService,
  MediaKind,
} from '../ai/media-understanding.service';
import { UploadService } from '../upload/upload.service';
import { ConversationsGateway } from './conversations.gateway';
import {
  BlockedContactsService,
  blockKey,
  type BlockTarget,
} from './blocked-contacts.service';
import { HandoffService } from './handoff.service';
import {
  ConversationAssignmentService,
  isSupervisor,
  type Actor,
} from './conversation-assignment.service';
import { LeadsService } from '../leads/leads.service';
import { PushService } from '../push/push.service';
import { NativePushService } from '../notifications/push.service';
import { SuppressionService } from '../suppression/suppression.service';
import { Customer } from '../customers/customer.schema';
import { hasAttribution, type AdReferral } from '../shared/ad-referral';
import { CampaignAttributionService } from '../campaign-attribution/campaign-attribution.service';
import {
  campaignFromReferral,
  listConversationCampaigns,
  parseCampaignFilter,
  type ConversationCampaign,
} from '../campaign-attribution/campaign-attribution';
import { Lead } from '../leads/lead.schema';

/** Respuestas del agente por hora en un mismo hilo de correo antes de pausarlo. */
const MAX_AGENT_EMAILS_PER_HOUR = 5;

/** Historial que se le pasa al agente IA en cada respuesta. */
const AI_HISTORY_LIMIT = 20;
const DEFAULT_PAGE_SIZE = 50;
/** Tope de etiquetas por contacto: la ficha deja de ser legible más allá. */
const MAX_TAGS = 12;

/**
 * Cada cuánto se refresca la foto de perfil. Las URLs firmadas de Meta duran
 * más que esto; con tres días se renuevan de sobra sin convertir cada mensaje
 * entrante en una llamada extra a su API.
 */
const AVATAR_TTL_MS = 3 * 24 * 60 * 60 * 1000;

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
  /** Instagram / Messenger: URL directa de descarga. */
  downloadUrl?: string;
  mimeType?: string;
  filename?: string;
}

/** Mensaje entrante ya normalizado por el webhook del proveedor. */
export interface InboundMessage {
  contact: string;
  chatId?: string;
  contactName?: string;
  /**
   * Foto de perfil, solo en Messenger e Instagram. WhatsApp Cloud API no la
   * expone: el webhook trae únicamente `profile.name`, y el único
   * `profile_picture_url` de su API es el del propio número de empresa.
   */
  contactAvatar?: string;
  externalId?: string;
  type: MessageType;
  text?: string;
  media?: InboundMedia;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  at?: Date;
  /** Anuncio del que salió el chat (Click-to-WhatsApp), si lo trae el canal. */
  referral?: AdReferral;
  /** true cuando el mensaje lo envió el negocio desde su propio móvil. */
  fromMe?: boolean;
  /** Correo: asunto y cadena de Message-ID previos. */
  subject?: string;
  emailReferences?: string[];
  /** Tipo tal como lo nombró el proveedor, para diagnosticar lo no soportado. */
  rawType?: string;
  /** El canal avisó de un adjunto pero no entregó el archivo. */
  mediaUnavailable?: boolean;
  /** Aviso del propio canal (cambio de número...): el agente IA no lo contesta. */
  noAgent?: boolean;
}

/** Nombre del canal tal como se muestra en avisos y notificaciones. */
const CHANNEL_LABEL: Record<ConversationChannel, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  messenger: 'Messenger',
  email: 'Correo',
};

/**
 * Lo que el agente debe saber al contestar un correo: no es un chat, así que
 * se espera un saludo, párrafos y una despedida, sin emojis de mensajería.
 */
const EMAIL_CHANNEL_HINT =
  'Estás respondiendo por CORREO ELECTRÓNICO, no por chat: saluda por el nombre si lo conoces, responde en párrafos claros y completos, y cierra con una despedida cordial. No uses emojis ni formato de chat, y no escribas el asunto ni la firma: la plataforma los añade.';

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

/**
 * Qué adjuntos se convierten a texto al recibirlos. Los stickers quedan fuera a
 * propósito: son decorativos, llegan a montones y leerlos cuesta lo mismo que
 * leer una foto que sí trae información.
 */
const MEDIA_KIND_BY_TYPE: Partial<Record<MessageType, MediaKind>> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  voice: 'voice',
  document: 'document',
};

/** Cómo se le presenta al agente IA el texto que se sacó del adjunto. */
const TRANSCRIPT_LABEL: Partial<Record<MessageType, string>> = {
  image: 'Lo que se ve en la imagen',
  video: 'Lo que se ve y se dice en el video',
  audio: 'Transcripción del audio',
  voice: 'Transcripción de la nota de voz',
  document: 'Contenido del documento',
};

/** Lo mismo, pero redactado para la notificación del sistema. */
const PUSH_HINT_BY_TYPE: Record<MessageType, string> = {
  text: 'Nuevo mensaje',
  image: '📷 Foto',
  video: '🎥 Video',
  audio: '🎧 Audio',
  voice: '🎤 Nota de voz',
  document: '📄 Documento',
  sticker: 'Sticker',
  location: '📍 Ubicación',
  contact: '👤 Contacto',
  unsupported: 'Nuevo mensaje',
};

/** Largo máximo del extracto del mensaje en la notificación. */
const PUSH_EXCERPT_MAX = 100;

/**
 * Cuerpo de la notificación de un mensaje entrante: extracto de hasta 100
 * caracteres y, si el chat acumula varios sin leer, cuántos son.
 */
export function inboundPushBody(preview: string, unread: number): string {
  const clean = preview.replace(/\s+/g, ' ').trim();
  const excerpt =
    clean.length > PUSH_EXCERPT_MAX
      ? `${clean.slice(0, PUSH_EXCERPT_MAX - 1).trimEnd()}…`
      : clean;
  return unread > 1 ? `${unread} mensajes nuevos · ${excerpt}` : excerpt;
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @InjectModel(Conversation.name) private convModel: Model<Conversation>,
    @InjectModel(Message.name) private msgModel: Model<Message>,
    private wa: WhatsAppService,
    private ig: InstagramService,
    private ms: MessengerService,
    private waAccounts: WhatsAppAccountsService,
    private igAccounts: InstagramAccountsService,
    private msAccounts: MessengerAccountsService,
    private agents: AiAgentsService,
    private media: MediaUnderstandingService,
    private uploads: UploadService,
    private gateway: ConversationsGateway,
    private handoff: HandoffService,
    private leads: LeadsService,
    private push: PushService,
    private nativePush: NativePushService,
    private suppression: SuppressionService,
    private emailAccounts: EmailAccountsService,
    private emailTransport: EmailTransportService,
    private assignment: ConversationAssignmentService,
    private attribution: CampaignAttributionService,
    private blocks: BlockedContactsService,
  ) {}

  /**
   * Conversaciones que vinieron de un anuncio antes de existir el origen de
   * campaña: se marcan una vez al arrancar (idempotente).
   */
  async onModuleInit(): Promise<void> {
    try {
      const res = await this.convModel
        .updateMany(
          {
            campaign: { $exists: false },
            'adReferral.adId': { $exists: true, $ne: null },
          },
          [
            {
              $set: {
                campaign: {
                  kind: 'ad',
                  id: { $toString: '$adReferral.adId' },
                  // Titular del anuncio o, si viene vacío, "Anuncio <id>".
                  name: {
                    $let: {
                      vars: {
                        h: {
                          $substrCP: [
                            {
                              $trim: {
                                input: {
                                  $ifNull: ['$adReferral.headline', ''],
                                },
                              },
                            },
                            0,
                            120,
                          ],
                        },
                      },
                      in: {
                        $cond: [
                          { $gt: [{ $strLenCP: '$$h' }, 0] },
                          '$$h',
                          {
                            $concat: [
                              'Anuncio ',
                              { $toString: '$adReferral.adId' },
                            ],
                          },
                        ],
                      },
                    },
                  },
                  at: { $ifNull: ['$adReferral.at', '$createdAt'] },
                },
              },
            },
          ],
        )
        .exec();
      if (res.modifiedCount)
        this.logger.log(
          `${res.modifiedCount} conversación(es) de anuncios marcadas con su campaña`,
        );
    } catch (err) {
      this.logger.warn(
        `No se pudo marcar el origen de anuncios: ${String(err)}`,
      );
    }
  }

  /**
   * Campañas de las que vienen las conversaciones de la empresa, con cuántas
   * hay de cada una (más recientes primero). Opcionalmente de un solo canal.
   */
  listCampaigns(tenantId: string, channel?: string) {
    return listConversationCampaigns(this.convModel, tenantId, channel);
  }

  /** Origen de campaña para una conversación sin origen (anuncio o campaña de Maya). */
  private async resolveCampaign(
    channel: ConversationChannel,
    tenantId: string,
    inbound: InboundMessage,
  ): Promise<ConversationCampaign | null> {
    const fromAd = campaignFromReferral(inbound.referral);
    if (fromAd) return fromAd;
    try {
      return await this.attribution.lookup(tenantId, channel, inbound.contact);
    } catch (err) {
      this.logger.warn(`No se pudo atribuir la campaña: ${String(err)}`);
      return null;
    }
  }

  // ------------------------------------------------------------------
  // Consulta (bandeja de entrada)
  // ------------------------------------------------------------------

  /**
   * Cuentas conectadas del tenant (WhatsApp + Instagram + Messenger) por las que
   * puede entrar una conversación. Sirve para el selector de cuenta de la bandeja.
   */
  async listAccounts(tenantId: string): Promise<InboxAccount[]> {
    const [wa, ig, ms, em, counts] = await Promise.all([
      this.waAccounts.findAll(tenantId),
      this.igAccounts.findAll(tenantId),
      this.msAccounts.findAll(tenantId),
      this.emailAccounts.findAll(tenantId),
      this.countsByAccount(tenantId),
    ]);

    const withCounts = (id: string) => counts[id] ?? { total: 0, unread: 0 };

    return [
      ...wa.map((a) => ({
        _id: String(a._id),
        channel: 'whatsapp' as const,
        label: a.label,
        detail: a.phoneNumber || 'Cloud API',
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
      ...ms.map((a) => ({
        _id: String(a._id),
        channel: 'messenger' as const,
        label: a.label,
        detail: a.pageName || 'Messenger',
        active: a.active,
        isDefault: !!a.isDefault,
        ...withCounts(String(a._id)),
      })),
      ...em.map((a) => ({
        _id: String(a._id),
        channel: 'email' as const,
        label: a.label,
        detail: a.email,
        active: a.active,
        isDefault: !!a.isDefault,
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
      /** Agente IA: las que respondió o las de las cuentas por las que responde. */
      agent?: { agentId: Types.ObjectId; accountIds: Types.ObjectId[] };
      /** Contactos con las etiquetas pedidas (vacío = ninguna coincide). */
      customerIds?: Types.ObjectId[];
      /** Solo los chats bloqueados. */
      blocked?: boolean;
      /**
       * Por quién la atiende: `me` (las mías), `unassigned` (en cola: sin IA y
       * sin dueño), `ai` (las atiende el agente IA) u `others` (de otro vendedor).
       */
      assigned?: { mode: string; userId: string };
      /** Origen de campaña: `ad:<id>` o `campaign:<id>`. Inválido = se ignora. */
      campaign?: string;
    } = {},
  ) {
    const query: QueryFilter<Conversation> = {
      tenantId: new Types.ObjectId(tenantId),
    };
    const campaign = parseCampaignFilter(filters.campaign);
    if (campaign) {
      query['campaign.kind'] = campaign.kind;
      query['campaign.id'] = campaign.id;
    }
    // Uno o varios canales separados por coma ("whatsapp,instagram,messenger"
    // es la pestaña de chats, sin el correo).
    const channels = (filters.channel ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean) as ConversationChannel[];
    if (channels.length === 1) query.channel = channels[0];
    else if (channels.length > 1) query.channel = { $in: channels };
    if (filters.accountId && Types.ObjectId.isValid(filters.accountId))
      query.accountId = new Types.ObjectId(filters.accountId);
    if (filters.status) query.status = filters.status;
    if (filters.unread) query.unreadCount = { $gt: 0 };
    if (filters.blocked) query.blocked = true;
    if (filters.assigned) {
      const me = new Types.ObjectId(filters.assigned.userId);
      if (filters.assigned.mode === 'me') query.takenOverBy = me;
      else if (filters.assigned.mode === 'unassigned') {
        query.autoReply = false;
        query.takenOverBy = null;
      } else if (filters.assigned.mode === 'ai') query.autoReply = true;
      else if (filters.assigned.mode === 'others')
        query.takenOverBy = { $nin: [null, me] };
    }
    if (filters.customerIds) query.customerId = { $in: filters.customerIds };
    const and: QueryFilter<Conversation>[] = [];
    if (filters.agent) {
      and.push({
        $or: [
          { agentId: filters.agent.agentId },
          {
            agentId: { $exists: false },
            accountId: { $in: filters.agent.accountIds },
          },
        ],
      });
    }
    if (filters.q) {
      const rx = new RegExp(
        filters.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      and.push({
        $or: [{ contact: rx }, { contactName: rx }, { lastMessagePreview: rx }],
      });
    }
    if (and.length) query.$and = and;
    const convs = await this.convModel
      .find(query)
      .sort({ lastMessageAt: -1 })
      .limit(200)
      .exec();
    return this.withCrmInfo(tenantId, convs);
  }

  /**
   * Adjunta a cada conversación lo que hace falta para decidir a quién atender:
   * las etiquetas de su contacto y si pidió no recibir comunicaciones.
   *
   * Dos consultas para toda la página, no dos por chat.
   */
  private async withCrmInfo(
    tenantId: string,
    convs: Conversation[],
  ): Promise<(Conversation & { tags?: string[]; doNotContact?: boolean })[]> {
    const ids = convs
      .map((c) => c.customerId)
      .filter((id): id is Types.ObjectId => !!id);

    const [byId, blocked] = await Promise.all([
      ids.length
        ? this.leads.contactInfoByCustomer(tenantId, ids.map(String))
        : Promise.resolve(
            new Map<
              string,
              { tags: string[]; phone?: string; email?: string }
            >(),
          ),
      this.suppression.setFor(tenantId),
    ]);
    if (ids.length === 0 && blocked.empty) return convs;

    return convs.map((c) => {
      const info = c.customerId ? byId.get(String(c.customerId)) : undefined;
      // La baja se comprueba por el identificador del chat (el teléfono, en
      // WhatsApp) y también por los datos del contacto vinculado.
      const noContactar = this.suppression.matches(blocked, {
        phone: c.channel === 'whatsapp' ? c.contact : info?.phone,
        email: c.channel === 'email' ? c.contact : info?.email,
      });
      if (!info?.tags?.length && !noContactar) return c;
      // `toObject` para poder añadir campos que no están en el esquema.
      return {
        ...c.toObject(),
        ...(info?.tags?.length ? { tags: info.tags } : {}),
        ...(noContactar ? { doNotContact: true } : {}),
      } as Conversation & { tags?: string[]; doNotContact?: boolean };
    });
  }

  /**
   * Da de baja (o reactiva) al contacto de esta conversación.
   *
   * Trabaja sobre el dato de contacto y no sobre la ficha del CRM: así la baja
   * sobrevive a que el contacto se borre o se vuelva a importar.
   */
  async setDoNotContact(
    id: string,
    tenantId: string,
    userId: string,
    blocked: boolean,
    reason?: string,
  ): Promise<{ conversation: Conversation; doNotContact: boolean }> {
    const conv = await this.getConversation(id, tenantId);
    const customer = conv.customerId
      ? await this.leads.findCustomer(String(conv.customerId), tenantId)
      : null;
    const contact = {
      phone: conv.channel === 'whatsapp' ? conv.contact : customer?.phone,
      email: conv.channel === 'email' ? conv.contact : customer?.email,
    };
    if (!contact.phone && !contact.email)
      throw new BadRequestException(
        'Este chat no tiene teléfono ni email: guarda antes el contacto para poder darlo de baja.',
      );

    if (blocked) {
      await this.suppression.add(tenantId, {
        ...contact,
        name: customer?.name ?? conv.contactName,
        reason,
        source: 'inbox',
        userId,
        conversationId: String(conv._id),
      });
      // El agente no puede seguir hablándole a quien acaba de pedir que no.
      if (conv.autoReply) {
        conv.autoReply = false;
        conv.takenOverAt = new Date();
        await conv.save();
      }
    } else {
      await this.suppression.removeByContact(tenantId, contact);
    }

    this.gateway.emitConversation(tenantId, conv);
    return { conversation: conv, doNotContact: blocked };
  }

  /**
   * Bloquea (o desbloquea) al contacto del chat. El bloqueo se guarda en
   * `BlockedContactsService` (sobrevive a que el chat se elimine) y vale para
   * todas las cuentas del canal. Bloqueado, sus mensajes se descartan al
   * llegar, no se le puede escribir y entra en la lista de no contactar. En
   * WhatsApp se bloquea además en el proveedor; si eso falla, el bloqueo en la
   * plataforma se mantiene y se devuelve el motivo.
   *
   * Con `allChannels` se bloquean también el teléfono, el email y los demás
   * chats del cliente vinculado. Desbloquear solo quita el bloqueo de este
   * contacto y no lo saca de la lista de no contactar.
   */
  async setBlocked(
    id: string,
    tenantId: string,
    userId: string,
    blocked: boolean,
    reason?: string,
    opts: { allChannels?: boolean; userName?: string } = {},
  ): Promise<{
    conversation: Conversation;
    blocked: boolean;
    channelBlocked: boolean;
    channelError?: string;
    doNotContact?: boolean;
    blockedCount?: number;
  }> {
    const conv = await this.getConversation(id, tenantId);

    let channelBlocked = false;
    let channelError: string | undefined;
    if (conv.channel === 'whatsapp') {
      try {
        const account = await this.waAccounts.findById(String(conv.accountId));
        if (!account) throw new Error('La cuenta de WhatsApp ya no existe');
        await this.wa.setContactBlocked(
          this.waAccounts.toConfig(account),
          conv.chatId ?? conv.contact,
          blocked,
        );
        channelBlocked = true;
      } catch (err) {
        channelError = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `No se pudo ${blocked ? 'bloquear' : 'desbloquear'} el chat ${String(conv._id)} en WhatsApp: ${channelError}`,
        );
      }
    }

    let doNotContact: boolean | undefined;
    let blockedCount: number | undefined;
    let targets: BlockTarget[] = [
      { channel: conv.channel, contact: conv.contact },
    ];
    if (blocked) {
      const customer = conv.customerId
        ? await this.leads.findCustomer(String(conv.customerId), tenantId)
        : null;
      targets = await this.blockTargets(conv, tenantId, customer, {
        allChannels: opts.allChannels === true,
      });
      const entries = await this.blocks.block(
        tenantId,
        targets,
        {
          reason,
          source: 'inbox',
          userId,
          userName: opts.userName,
          name: customer?.name ?? conv.contactName,
          customerId: conv.customerId,
          conversationId: conv._id,
        },
        { accountId: String(conv.accountId), onChannel: channelBlocked },
      );
      blockedCount = entries.length;

      const contact = {
        phone: conv.channel === 'whatsapp' ? conv.contact : customer?.phone,
        email: conv.channel === 'email' ? conv.contact : customer?.email,
      };
      if (contact.phone || contact.email) {
        await this.suppression.add(tenantId, {
          ...contact,
          name: customer?.name ?? conv.contactName,
          reason: reason?.trim() || 'Contacto bloqueado',
          source: 'inbox',
          userId,
          conversationId: String(conv._id),
        });
        doNotContact = true;
      }
    } else {
      await this.blocks.unblock(tenantId, conv.channel, conv.contact);
    }

    const updated = await this.getConversation(id, tenantId);
    this.gateway.emitConversation(tenantId, updated);
    await this.emitOtherChats(tenantId, targets, String(conv._id));
    return {
      conversation: updated,
      blocked,
      channelBlocked,
      ...(channelError ? { channelError } : {}),
      ...(doNotContact ? { doNotContact } : {}),
      ...(blockedCount !== undefined ? { blockedCount } : {}),
    };
  }

  /**
   * Identificadores a bloquear: el del chat y, con `allChannels`, el teléfono
   * (WhatsApp) y el email del cliente y los contactos de sus otros chats.
   */
  private async blockTargets(
    conv: Conversation,
    tenantId: string,
    customer: { phone?: string; email?: string } | null,
    opts: { allChannels: boolean },
  ): Promise<BlockTarget[]> {
    const targets: BlockTarget[] = [
      { channel: conv.channel, contact: conv.contact },
    ];
    if (!opts.allChannels || !conv.customerId) return targets;
    if (customer?.phone)
      targets.push({ channel: 'whatsapp', contact: customer.phone });
    if (customer?.email)
      targets.push({ channel: 'email', contact: customer.email });
    const others = await this.convModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        customerId: conv.customerId,
        _id: { $ne: conv._id },
      })
      .select('channel contact')
      .lean<Array<{ channel: ConversationChannel; contact: string }>>();
    for (const o of others)
      targets.push({ channel: o.channel, contact: o.contact });
    return targets;
  }

  /**
   * Avisa por tiempo real de los chats (de cualquier cuenta) cuyo bloqueo
   * cambió, salvo `exceptId`, que ya emitió quien llama.
   */
  private async emitOtherChats(
    tenantId: string,
    targets: BlockTarget[],
    exceptId?: string,
  ): Promise<void> {
    const or = targets.flatMap((t) => {
      const key = blockKey(t.channel, t.contact);
      return [...new Set([t.contact, key].filter(Boolean))].map((c) => ({
        channel: t.channel,
        contact: c,
      }));
    });
    if (!or.length) return;
    const convs = await this.convModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        ...(exceptId ? { _id: { $ne: new Types.ObjectId(exceptId) } } : {}),
        $or: or,
      })
      .exec();
    for (const c of convs) this.gateway.emitConversation(tenantId, c);
  }

  /** Bloqueo a mano desde la pantalla de bloqueados (número, email o id). */
  async blockManual(
    tenantId: string,
    userId: string,
    dto: {
      channel: ConversationChannel;
      contact: string;
      reason?: string;
      userName?: string;
    },
  ) {
    const identifier = blockKey(dto.channel, dto.contact);
    if (!identifier)
      throw new BadRequestException(
        dto.channel === 'whatsapp'
          ? 'El número no es válido'
          : 'El contacto no es válido',
      );
    const [entry] = await this.blocks.block(
      tenantId,
      [{ channel: dto.channel, contact: identifier }],
      {
        reason: dto.reason,
        source: 'manual',
        userId,
        userName: dto.userName,
      },
    );
    if (dto.channel === 'whatsapp' || dto.channel === 'email')
      await this.suppression.add(tenantId, {
        phone: dto.channel === 'whatsapp' ? identifier : undefined,
        email: dto.channel === 'email' ? identifier : undefined,
        reason: dto.reason?.trim() || 'Contacto bloqueado',
        source: 'inbox',
        userId,
      });
    await this.emitOtherChats(tenantId, [
      { channel: dto.channel, contact: identifier },
    ]);
    return entry;
  }

  /**
   * Quita un bloqueo desde la pantalla de bloqueados. Si también estaba
   * bloqueado en WhatsApp, intenta quitarlo allí; si falla, avisa del motivo.
   * El contacto sigue en "No contactar".
   */
  async unblockEntry(
    tenantId: string,
    id: string,
  ): Promise<{ removed: true; channelError?: string }> {
    const entry = await this.blocks.removeById(tenantId, id);
    if (!entry) throw new NotFoundException('Bloqueo no encontrado');
    let channelError: string | undefined;
    if (entry.channel === 'whatsapp' && entry.onChannel && entry.accountId) {
      try {
        const account = await this.waAccounts.findById(String(entry.accountId));
        if (!account) throw new Error('La cuenta de WhatsApp ya no existe');
        await this.wa.setContactBlocked(
          this.waAccounts.toConfig(account),
          entry.identifier,
          false,
        );
      } catch (err) {
        channelError = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `No se pudo desbloquear ${String(entry._id)} en WhatsApp: ${channelError}`,
        );
      }
    }
    await this.emitOtherChats(tenantId, [
      { channel: entry.channel, contact: entry.identifier },
    ]);
    this.logger.log(`Desbloqueo: tenant=${tenantId} bloqueo=${id}`);
    return { removed: true, ...(channelError ? { channelError } : {}) };
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
    // Las insignias de todos los clientes dependen de este evento: se emite
    // antes de avisar al proveedor, cuyo fallo no puede dejarlas desfasadas.
    this.gateway.emitConversation(tenantId, conv);

    try {
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
      } else if (conv.channel === 'messenger') {
        const account = await this.msAccounts.findById(String(conv.accountId));
        if (account)
          await this.ms.markSeen(
            this.msAccounts.toConfig(account),
            conv.contact,
          );
      }
    } catch (err) {
      this.logger.warn(
        `No se pudo marcar como leída en el proveedor la conversación ${String(conv._id)}: ${(err as Error).message}`,
      );
    }
    return conv;
  }

  /**
   * Enciende/apaga la respuesta automática del agente para esta conversación.
   * Apagarla es tomar el chat; encenderla lo devuelve al agente y lo saca de la
   * cola. Si otro vendedor lo atiende, solo él o un supervisor pueden hacerlo.
   */
  async setAutoReply(
    id: string,
    tenantId: string,
    enabled: boolean,
    actor: Actor,
  ) {
    const conv = await this.getConversation(id, tenantId);
    this.assignment.assertCanControl(conv, actor);
    if (!enabled)
      return this.assignment.take(
        id,
        tenantId,
        actor,
        isSupervisor(actor.role),
      );
    if (conv.autoReply) return conv;
    conv.autoReply = true;
    // Reactivar el agente cierra la derivación: ya nadie tiene que entrar a atenderla.
    conv.escalated = false;
    conv.escalationReason = undefined;
    conv.escalatedAt = undefined;
    conv.takenOverBy = undefined;
    conv.takenOverByName = undefined;
    conv.takenOverAt = undefined;
    await conv.save();
    await this.assignment.note(
      conv,
      `${await this.assignment.nameOf(actor.userId)} devolvió la conversación al agente IA.`,
    );
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

  // ------------------------------------------------------------------
  // Ficha del contacto (CRM)
  // ------------------------------------------------------------------

  /**
   * Guarda a quien escribe como contacto del CRM y lo vincula a la
   * conversación. Si ya existe alguien con ese teléfono o email se reutiliza,
   * para que la misma persona no se duplique por escribir desde dos canales.
   */
  async saveContact(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
    dto: SaveContactDto,
  ): Promise<{ conversation: Conversation; customer: Customer; lead?: Lead }> {
    const conv = await this.getConversation(id, tenantId);
    const customer = await this.ensureCustomer(conv, tenantId, userId, role, {
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
    });

    // Lo que escribe quien atiende manda sobre lo que trae el canal.
    if (dto.name?.trim()) customer.name = dto.name.trim();
    if (dto.tags?.length)
      customer.tags = [...new Set([...customer.tags, ...dto.tags])];
    if (dto.notes !== undefined) customer.notes = dto.notes;
    if (conv.channel === 'instagram')
      customer.customFields = {
        ...(customer.customFields ?? {}),
        instagramId: conv.contact,
      };
    if (conv.channel === 'messenger')
      customer.customFields = {
        ...(customer.customFields ?? {}),
        messengerId: conv.contact,
      };
    await customer.save();

    conv.customerId = customer._id;
    await conv.save();
    this.gateway.emitConversation(tenantId, conv);

    let lead: Lead | undefined;
    if (dto.createLead) {
      lead = await this.leads.create(tenantId, userId, role, {
        customerId: String(customer._id),
        title: dto.leadTitle?.trim() || `Seguimiento de ${customer.name}`,
        value: dto.leadValue,
        source: conv.channel,
        conversationId: String(conv._id),
      });
    }

    return { conversation: conv, customer, lead };
  }

  /**
   * Contacto del CRM para esta conversación, creándolo si aún no existía.
   *
   * Clasificar un chat tiene que funcionar de un toque aunque nadie lo haya
   * guardado antes como contacto: aquí es donde se resuelve el nombre y el
   * teléfono a partir de lo que trae el canal.
   */
  private async ensureCustomer(
    conv: Conversation,
    tenantId: string,
    userId: string,
    role: string,
    data: { name?: string; email?: string; phone?: string } = {},
  ): Promise<Customer> {
    // En WhatsApp el identificador del chat ya es el teléfono; en Instagram y
    // Messenger no hay número, así que solo se guarda lo que escriba quien atiende.
    const phone =
      data.phone?.trim() ||
      (conv.channel === 'whatsapp' ? conv.contact : undefined);
    const email =
      data.email?.trim() ||
      (conv.channel === 'email' ? conv.contact : undefined);
    const name =
      data.name?.trim() ||
      conv.contactName?.trim() ||
      (phone ? `+${conv.contact}` : conv.contact);

    const customer = await this.leads.upsertCustomer(tenantId, userId, role, {
      name,
      email,
      phone,
      source: conv.channel,
    });

    // Las conversiones cuelgan del contacto, no del chat: el anuncio de origen
    // viaja con él la primera vez que se guarda.
    if (
      hasAttribution(conv.adReferral) &&
      !hasAttribution(customer.adReferral)
    ) {
      customer.adReferral = conv.adReferral;
      await customer.save();
    }
    return customer;
  }

  /** Etiquetas ya usadas en el tenant, para sugerirlas al clasificar. */
  async availableTags(tenantId: string): Promise<string[]> {
    return this.leads.customerTags(tenantId);
  }

  /**
   * Clasifica la conversación: fija las etiquetas de su contacto.
   *
   * Reemplaza en vez de fusionar porque la pantalla es una lista de
   * interruptores — quitar una etiqueta tiene que quitarla de verdad.
   */
  async setTags(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
    tags: string[],
  ): Promise<{ conversation: Conversation; customer: Customer }> {
    const conv = await this.getConversation(id, tenantId);
    const customer = await this.ensureCustomer(conv, tenantId, userId, role);

    const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))].slice(
      0,
      MAX_TAGS,
    );
    customer.tags = clean;
    await customer.save();

    if (!conv.customerId) {
      conv.customerId = customer._id;
      await conv.save();
      this.gateway.emitConversation(tenantId, conv);
    }
    return { conversation: conv, customer };
  }

  /**
   * Manda la conversación a seguimiento: crea la oportunidad enlazada al chat.
   *
   * Si ya hay una abierta no se duplica —el equipo acabaría con dos fichas del
   * mismo cliente—: se devuelve la que ya existe.
   */
  async sendToPipeline(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
    dto: SendToPipelineDto,
  ): Promise<{
    conversation: Conversation;
    customer: Customer;
    lead: Lead;
    created: boolean;
  }> {
    const conv = await this.getConversation(id, tenantId);
    const customer = await this.ensureCustomer(conv, tenantId, userId, role);

    if (!conv.customerId) {
      conv.customerId = customer._id;
      await conv.save();
      this.gateway.emitConversation(tenantId, conv);
    }

    const open = (
      await this.leads.findByCustomer(String(customer._id), tenantId)
    ).find((l) => l.status === 'open');
    if (open)
      return { conversation: conv, customer, lead: open, created: false };

    const lead = await this.leads.create(tenantId, userId, role, {
      customerId: String(customer._id),
      title: dto.title?.trim() || `Seguimiento de ${customer.name}`,
      stage: dto.stage,
      value: dto.value,
      priority: dto.priority,
      source: conv.channel,
      conversationId: String(conv._id),
    });
    return { conversation: conv, customer, lead, created: true };
  }

  /** Contacto vinculado a la conversación y sus oportunidades abiertas. */
  async crmCard(
    id: string,
    tenantId: string,
  ): Promise<{ customer: Customer | null; leads: Lead[] }> {
    const conv = await this.getConversation(id, tenantId);
    if (!conv.customerId) return { customer: null, leads: [] };
    const customer = await this.leads.findCustomer(
      String(conv.customerId),
      tenantId,
    );
    if (!customer) return { customer: null, leads: [] };
    // La bandeja muestra quién atiende al contacto, no solo su id.
    await customer.populate('ownerId', 'name email');
    return {
      customer,
      leads: await this.leads.findByCustomer(String(customer._id), tenantId),
    };
  }

  // ------------------------------------------------------------------
  // Envío manual (operador humano)
  // ------------------------------------------------------------------

  async sendManual(
    id: string,
    tenantId: string,
    userId: string,
    dto: SendMessageDto,
    opts: { background?: boolean } = {},
  ) {
    let conv = await this.getConversation(id, tenantId);
    if (conv.blocked)
      throw new BadRequestException(
        'Este contacto está bloqueado: desbloquéalo para escribirle.',
      );
    const type: MessageType = dto.type ?? (dto.mediaUrl ? 'document' : 'text');
    if (type === 'text' && !dto.text?.trim())
      throw new BadRequestException('El mensaje está vacío');
    if (type !== 'text' && !dto.mediaUrl)
      throw new BadRequestException('Falta la URL del archivo');

    // Solo escribe quien atiende el chat. Si nadie lo atiende, escribir es
    // tomarlo (y pausa al agente: quien contesta es la persona). Con
    // `pauseAgent: false` se responde sin quitarle el chat al agente.
    const actor: Actor = { userId, role: '' };
    if (!(conv.autoReply && dto.pauseAgent === false))
      conv = await this.assignment.ensureWriter(conv, actor);
    else this.assignment.assertCanControl(conv, actor);

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
      replyToId: dto.replyToId ? new Types.ObjectId(dto.replyToId) : undefined,
      subject:
        conv.channel === 'email' ? dto.subject?.trim() || undefined : undefined,
      status: 'pending',
      sentBy: new Types.ObjectId(userId),
      at: new Date(),
    });

    await this.touchConversation(conv, msg);
    this.gateway.emitMessage(tenantId, msg);

    // Desde la bandeja no se espera al proveedor: el mensaje ya está guardado
    // y su estado (enviado / fallido) llega por el socket. Así el operador no
    // se queda un segundo mirando el botón de enviar.
    if (opts.background) {
      this.finishDelivery(tenantId, conv, msg).catch((err) =>
        this.logger.error(
          `Error guardando el estado del mensaje ${String(msg._id)}: ${String(err)}`,
        ),
      );
      return msg;
    }
    return this.finishDelivery(tenantId, conv, msg);
  }

  /** Entrega el mensaje ya guardado y publica su estado final. */
  private async finishDelivery(
    tenantId: string,
    conv: Conversation,
    msg: Message,
  ): Promise<Message> {
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

  /**
   * Vuelve a entregar un mensaje ya guardado (reintento automático, HU7).
   * Solo envía: el estado lo guarda quien llama.
   */
  redeliver(conv: Conversation, msg: Message): Promise<string | undefined> {
    return this.deliver(conv, msg);
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
    // Messenger e Instagram mandan el texto aparte del adjunto: sin texto, no
    // se repite el nombre del archivo como mensaje.
    const metaBody = msg.text ?? '';

    // Para citar hace falta el id del mensaje EN EL PROVEEDOR, no el nuestro.
    // Si el citado no lo tiene (por ejemplo, uno que falló al enviarse), se
    // manda sin cita en vez de romper el envío.
    const replyTo = msg.replyToId
      ? (
          await this.msgModel
            .findById(msg.replyToId)
            .select('externalId')
            .lean<{ externalId?: string }>()
        )?.externalId
      : undefined;

    if (conv.channel === 'email') return this.deliverEmail(conv, msg);

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
        replyTo,
      );
    }

    if (conv.channel === 'messenger') {
      const msAccount = await this.msAccounts.findById(String(conv.accountId));
      if (!msAccount) throw new Error('La cuenta de Messenger ya no existe');
      if (!msAccount.active)
        throw new Error('La cuenta de Messenger está inactiva');
      const msConfig: MsConfig = this.msAccounts.toConfig(msAccount);
      return this.ms.sendMessage(
        conv.contact,
        metaBody,
        msConfig,
        msg.mediaUrl,
        mediaType,
        replyTo,
      );
    }

    const igAccount = await this.igAccounts.findById(String(conv.accountId));
    if (!igAccount) throw new Error('La cuenta de Instagram ya no existe');
    const igConfig: IgConfig = this.igAccounts.toConfig(igAccount);
    await this.ig.sendMessage(
      conv.contact,
      metaBody,
      igConfig,
      msg.mediaUrl,
      mediaType,
      replyTo,
    );
    return undefined;
  }

  /**
   * Envía el mensaje como correo, en el mismo hilo que el último correo del
   * cliente (In-Reply-To / References) para que su programa lo agrupe.
   */
  private async deliverEmail(
    conv: Conversation,
    msg: Message,
  ): Promise<string> {
    const account = await this.emailAccounts.findById(String(conv.accountId));
    if (!account) throw new Error('La cuenta de correo ya no existe');
    if (!account.active) throw new Error('La cuenta de correo está inactiva');

    const lastIn = await this.msgModel
      .findOne({
        conversationId: conv._id,
        direction: 'in',
        externalId: { $exists: true },
      })
      .sort({ at: -1 })
      .select('externalId emailReferences subject')
      .lean<{
        externalId?: string;
        emailReferences?: string[];
        subject?: string;
      }>()
      .exec();

    const subject =
      msg.subject ||
      replySubject(lastIn?.subject || conv.emailSubject) ||
      `Mensaje de ${account.fromName || account.label}`;
    const references = lastIn?.externalId
      ? [...(lastIn.emailReferences ?? []), lastIn.externalId].slice(-20)
      : undefined;
    const body = msg.text || (msg.mediaUrl ? (msg.filename ?? '') : '');
    const signature = account.signature?.trim();

    const messageId = await this.emailTransport.send(
      await this.emailAccounts.smtpConfig(account),
      {
        from: this.emailAccounts.fromHeader(account),
        to: conv.contact,
        subject,
        text: signature ? `${body}\n\n--\n${signature}` : body,
        html: textToHtml(body, signature),
        inReplyTo: lastIn?.externalId,
        references,
        // RFC 3834: marca la respuesta como automática para que otros
        // contestadores no le respondan y no se forme un bucle.
        headers:
          msg.author === 'agent'
            ? { 'Auto-Submitted': 'auto-replied' }
            : undefined,
        attachments: msg.mediaUrl
          ? [
              {
                href: msg.mediaUrl,
                filename: msg.filename,
                contentType: msg.mimeType,
              },
            ]
          : undefined,
      },
    );
    msg.subject = subject;
    msg.emailReferences = references;
    if (conv.emailSubject !== subject) {
      conv.emailSubject = subject;
      await conv.save();
    }
    return messageId;
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
      inbound: await this.withInstagramProfile(
        String(account._id),
        inbound,
        this.igAccounts.toConfig(account),
      ),
      downloadMedia: (media) => this.downloadPublicMedia(media),
      resolveAgent: () =>
        this.agents.findPublishedByInstagramAccount(String(account._id)),
    });
  }

  async handleMessengerInbound(
    account: MessengerAccount,
    inbound: InboundMessage,
  ) {
    const config = this.msAccounts.toConfig(account);
    await this.ingest({
      channel: 'messenger',
      tenantId: String(account.tenantId),
      accountId: String(account._id),
      inbound: await this.withMessengerProfile(
        String(account._id),
        inbound,
        config,
      ),
      downloadMedia: (media) => this.downloadPublicMedia(media),
      resolveAgent: () =>
        this.agents.findPublishedByMessengerAccount(String(account._id)),
      typing: (on: boolean) => this.ms.setTyping(config, inbound.contact, on),
    });
  }

  /**
   * Correo recibido en un buzón conectado. Cada remitente es una conversación
   * (como en los chats); el asunto viaja en cada mensaje.
   *
   * Los adjuntos entran como mensajes propios, sin despertar al agente; el
   * agente contesta al cuerpo, que se ingresa al final.
   */
  async handleEmailInbound(
    account: EmailAccount,
    email: ParsedEmail,
  ): Promise<'ingested' | 'skipped'> {
    if (!email.from || email.from === account.email) return 'skipped';
    if (account.skipBulk && email.bulk) return 'skipped';
    // El mismo correo puede llegar dos veces (reconexión, otra réplica).
    if (
      email.messageId &&
      (await this.msgModel.exists({
        tenantId: account.tenantId,
        externalId: email.messageId,
      }))
    )
      return 'skipped';

    const base = {
      channel: 'email' as const,
      tenantId: String(account.tenantId),
      accountId: String(account._id),
      resolveAgent: () =>
        this.agents.findPublishedByEmailAccount(String(account._id)),
    };
    const contact = {
      contact: email.from,
      contactName: email.fromName,
      at: email.date,
    };

    for (const file of email.attachments) {
      await this.ingest({
        ...base,
        quiet: true,
        inbound: {
          ...contact,
          type: this.typeFromMime(file.contentType),
          text: '',
          media: { mimeType: file.contentType, filename: file.filename },
        },
        downloadMedia: () =>
          Promise.resolve({ buffer: file.content, mimeType: file.contentType }),
      });
    }

    await this.ingest({
      ...base,
      // A un aviso automático o un rebote nunca le contesta el agente.
      noAgent: email.automated,
      inbound: {
        ...contact,
        type: 'text',
        text:
          email.text ||
          (email.attachments.length
            ? `(Correo con ${email.attachments.length} adjunto${email.attachments.length > 1 ? 's' : ''})`
            : '(Correo sin texto)'),
        externalId: email.messageId,
        subject: email.subject,
        emailReferences: email.references,
      },
      downloadMedia: () => Promise.resolve(null),
    });
    return 'ingested';
  }

  /**
   * Correo nuevo escrito desde la bandeja (no es respuesta a un hilo): crea
   * la conversación con el destinatario si no existía y lo envía.
   */
  async composeEmail(
    tenantId: string,
    userId: string,
    dto: {
      accountId: string;
      to: string;
      name?: string;
      subject: string;
      text: string;
      mediaUrl?: string;
      mimeType?: string;
      filename?: string;
    },
  ) {
    if (await this.blocks.isBlocked(tenantId, 'email', dto.to))
      throw new BadRequestException(
        'Este contacto está bloqueado: desbloquéalo para escribirle.',
      );
    const account = await this.emailAccounts.findOne(dto.accountId, tenantId);
    const conv = await this.upsertConversation(
      'email',
      tenantId,
      String(account._id),
      {
        contact: dto.to.trim().toLowerCase(),
        contactName: dto.name?.trim() || undefined,
        type: 'text',
      },
    );
    // Quien escribe es una persona: `sendManual` le asigna el hilo y apaga el
    // agente (o falla si ya lo atiende otro vendedor).
    this.assignment.assertCanControl(conv, { userId, role: '' });
    conv.emailSubject = dto.subject.trim();
    await conv.save();
    return this.sendManual(String(conv._id), tenantId, userId, {
      text: dto.text,
      subject: dto.subject,
      mediaUrl: dto.mediaUrl,
      mimeType: dto.mimeType,
      filename: dto.filename,
      type: dto.mediaUrl ? this.typeFromMime(dto.mimeType) : 'text',
      pauseAgent: true,
    });
  }

  /**
   * El webhook de Messenger solo trae el PSID: el nombre se pide aparte para que
   * la bandeja no muestre un id interno. Solo se consulta la primera vez —
   * pedirlo en cada mensaje sería una llamada extra a Meta por mensaje.
   * Si Meta no lo da, la conversación sigue con el PSID.
   */
  /** Igual que en Messenger: el webhook de Instagram solo trae el IGSID. */
  private async withInstagramProfile(
    accountId: string,
    inbound: InboundMessage,
    config: IgConfig,
  ): Promise<InboundMessage> {
    if (inbound.fromMe) return inbound;
    const known = await this.convModel
      .findOne({
        channel: 'instagram',
        accountId: new Types.ObjectId(accountId),
        contact: inbound.contact,
      })
      .select('contactName contactAvatarAt')
      .exec();

    if (
      (inbound.contactName || known?.contactName) &&
      !this.avatarCaducado(known?.contactAvatarAt)
    )
      return inbound;

    const profile = await this.ig.fetchContactProfile(inbound.contact, config);
    return {
      ...inbound,
      contactName: inbound.contactName ?? profile.name,
      contactAvatar: profile.avatar,
    };
  }

  private async withMessengerProfile(
    accountId: string,
    inbound: InboundMessage,
    config: MsConfig,
  ): Promise<InboundMessage> {
    if (inbound.fromMe) return inbound;
    const known = await this.convModel
      .findOne({
        channel: 'messenger',
        accountId: new Types.ObjectId(accountId),
        contact: inbound.contact,
      })
      .select('contactName contactAvatarAt')
      .exec();

    // Se pide el perfil si falta el nombre o si la foto ya está rancia. No en
    // cada mensaje: sería una llamada extra a Meta por mensaje recibido.
    if (
      (inbound.contactName || known?.contactName) &&
      !this.avatarCaducado(known?.contactAvatarAt)
    )
      return inbound;

    const profile = await this.ms.fetchContactProfile(inbound.contact, config);
    return {
      ...inbound,
      contactName: inbound.contactName ?? profile.name,
      contactAvatar: profile.avatar,
    };
  }

  /** Actualiza el estado de un mensaje saliente a partir del ack del proveedor. */
  async handleAck(externalId: string, status: MessageStatus, error?: string) {
    if (!externalId) return;
    const msg = await this.msgModel.findOne({ externalId }).exec();
    if (!msg) return;
    if (status === 'failed') {
      // El rechazo del proveedor manda sobre cualquier estado previo: Meta
      // primero confirma el envío ('sent') y después avisa de que falló.
      msg.status = 'failed';
      if (error) msg.error = error;
    } else {
      const order: MessageStatus[] = ['pending', 'sent', 'delivered', 'read'];
      // Nunca retrocedas el estado (los acks pueden llegar desordenados).
      if (
        msg.status !== 'failed' &&
        order.indexOf(status) <= order.indexOf(msg.status)
      )
        return;
      msg.status = status;
    }
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
    /** Solo archivar: sin avisos al equipo ni respuesta del agente. */
    quiet?: boolean;
    /** Avisar al equipo, pero sin respuesta del agente. */
    noAgent?: boolean;
  }) {
    const { channel, tenantId, accountId, inbound } = params;
    // Contacto bloqueado: se descarta antes de tocar la conversación, así el
    // bloqueo vale aunque su chat se haya eliminado.
    if (await this.blocks.isBlocked(tenantId, channel, inbound.contact)) {
      this.logger.log(
        `Mensaje entrante descartado: contacto bloqueado (tenant=${tenantId}, canal=${channel}).`,
      );
      return;
    }
    const conv = await this.upsertConversation(
      channel,
      tenantId,
      accountId,
      inbound,
      inbound.fromMe !== true,
    );
    // Contacto bloqueado: no se guarda, no avisa y no despierta al agente.
    if (conv.blocked) {
      this.logger.log(
        `Mensaje entrante descartado: chat ${String(conv._id)} bloqueado.`,
      );
      return;
    }

    // Eco de un mensaje que el negocio envió desde su propio móvil: solo se archiva.
    const isEcho = inbound.fromMe === true;
    if (isEcho && (await this.isDuplicateEcho(conv, inbound))) return;

    // El binario se descarga una sola vez: se re-hospeda en S3 y, de paso, se
    // interpreta más abajo sin volver a bajarlo del proveedor.
    const file = inbound.media
      ? await this.downloadInboundMedia(inbound.media, params.downloadMedia)
      : null;
    const media =
      inbound.media && file
        ? await this.storeInboundMedia(inbound.media, file, channel)
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
      // Avisó de un adjunto que no llegó (el canal no lo dio o no se pudo bajar).
      mediaUnavailable:
        inbound.mediaUnavailable || (!!inbound.media && !media) || undefined,
      rawType: inbound.rawType,
      latitude: inbound.latitude,
      longitude: inbound.longitude,
      locationName: inbound.locationName,
      externalId: inbound.externalId,
      subject: inbound.subject,
      emailReferences: inbound.emailReferences?.length
        ? inbound.emailReferences
        : undefined,
      status: isEcho ? 'sent' : 'read',
      at: inbound.at ?? new Date(),
    });

    if (inbound.subject) conv.emailSubject = inbound.subject;
    if (!isEcho) conv.unreadCount += 1;
    await this.touchConversation(conv, msg);
    this.gateway.emitMessage(tenantId, msg);
    // Aviso a los móviles del equipo por los dos canales: el service worker
    // atiende a la PWA y FCM a la app nativa. Van sin `await`: el push nunca
    // debe retrasar ni romper la recepción del mensaje. Los ecos no avisan,
    // son mensajes del propio negocio.
    if (!isEcho && !params.quiet) void this.notifyInbound(conv, msg);

    // Leer el adjunto va después de avisar al equipo y antes del agente: el
    // aviso no puede esperar a que el modelo transcriba, pero el agente sí —
    // si no, respondería a "[El cliente envió una nota de voz]" en vez de a lo
    // que la nota dice.
    if (!isEcho && file) await this.interpretMedia(conv, msg, file);

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

    if (params.quiet || params.noAgent || inbound.noAgent) return;
    // Lo que no se pudo interpretar no se contesta: el agente respondería a ciegas.
    if (inbound.type === 'unsupported') return;
    if (channel === 'email' && (await this.agentEmailFlood(conv))) return;
    if (!conv.autoReply || conv.status === 'closed') return;
    // Quien pidió no recibir comunicaciones no recibe respuestas automáticas.
    // Puede seguir escribiendo y una persona puede contestarle a mano: lo que
    // se corta es que un bot le siga hablando.
    if (await this.isSuppressedContact(conv)) {
      this.logger.log(
        `Conversación ${String(conv._id)}: contacto en la lista de no contactar, el agente no responde.`,
      );
      return;
    }
    await this.runAgent(conv, msg, params.resolveAgent, params.typing);
  }

  /** ¿El contacto de esta conversación pidió no recibir comunicaciones? */
  private async isSuppressedContact(conv: Conversation): Promise<boolean> {
    const customer = conv.customerId
      ? await this.leads.findCustomer(
          String(conv.customerId),
          String(conv.tenantId),
        )
      : null;
    return this.suppression.isSuppressed(String(conv.tenantId), {
      phone: conv.channel === 'whatsapp' ? conv.contact : customer?.phone,
      email: conv.channel === 'email' ? conv.contact : customer?.email,
    });
  }

  /**
   * Freno ante bucles de correo: un contestador automático que no se marca
   * como tal podría escribirse con el agente sin fin. Pasado el tope por hora
   * el agente se calla en ese hilo hasta que una persona lo revise.
   */
  private async agentEmailFlood(conv: Conversation): Promise<boolean> {
    const recent = await this.msgModel
      .countDocuments({
        conversationId: conv._id,
        author: 'agent',
        at: { $gte: new Date(Date.now() - 60 * 60_000) },
      })
      .exec();
    if (recent < MAX_AGENT_EMAILS_PER_HOUR) return false;
    this.logger.warn(
      `Conversación ${String(conv._id)}: el agente ya respondió ${recent} correos en la última hora; se pausa para evitar un bucle.`,
    );
    conv.autoReply = false;
    conv.takenOverAt = new Date();
    await conv.save();
    await this.systemNote(
      conv,
      `El agente IA se pausó en este hilo: respondió ${recent} correos en la última hora y podría estar en un bucle con un contestador automático. Revísalo y reactívalo si hace falta.`,
    );
    this.gateway.emitConversation(String(conv.tenantId), conv);
    return true;
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
      const { reply, filesToSend, handoff, bookings } =
        await this.agents.generateAnswer(agent, userMessage, history, {
          channel: conv.channel,
          ...(conv.channel === 'email'
            ? { channelHint: EMAIL_CHANNEL_HINT }
            : {}),
          // Para agendar: idempotencia por conversación y datos del cliente.
          conversationId: String(conv._id),
          contactName: conv.contactName,
          contactEmail: conv.channel === 'email' ? conv.contact : undefined,
        });

      conv.agentId = agent._id;
      await conv.save();

      const sendFile = (file: (typeof filesToSend)[number]) =>
        this.sendFromAgent(conv, {
          type: this.typeFromMime(file.contentType),
          text: file.caption || file.name,
          mediaUrl: file.url,
          mimeType: file.contentType,
          filename: file.name,
        });
      // Las fotos de producto llevan el mensaje en el pie: van antes del texto.
      for (const file of filesToSend.filter((f) => f.caption !== undefined))
        await sendFile(file);

      // Al derivar siempre se le dice algo al cliente, aunque la IA no escribiera.
      const text = reply || (handoff ? agent.handoffMessage : '');
      if (text) {
        await this.sendFromAgent(conv, { type: 'text', text });
      }
      for (const file of filesToSend.filter((f) => f.caption === undefined))
        await sendFile(file);

      // El equipo ve en el hilo cada cita que agendó el agente.
      for (const b of bookings ?? []) {
        const when = formatLocal(
          b.start,
          agent.calendar?.timeZone || 'America/Lima',
        );
        await this.assignment.note(
          conv,
          [
            `${agent.name} agendó una cita: ${when} – ${b.contactName}.`,
            b.attendeeEmail ? `Invitación enviada a ${b.attendeeEmail}.` : '',
            b.joinUrl
              ? `Videollamada: ${b.joinUrl}`
              : b.htmlLink
                ? `Evento: ${b.htmlLink}`
                : '',
          ]
            .filter(Boolean)
            .join(' '),
        );
      }

      if (handoff) {
        await this.escalateToHuman(conv, agent, handoff.reason, userMessage);
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

  /**
   * Deriva la conversación a una persona: avisa a los destinatarios configurados
   * en el agente (WhatsApp, correo o SMS), apaga la respuesta automática y deja constancia
   * en el hilo. Un fallo al avisar no impide apagar el agente — si nadie
   * responde el chat, el cliente no puede quedar hablando con un bot mudo.
   */
  private async escalateToHuman(
    conv: Conversation,
    agent: AiAgent,
    reason: string | undefined,
    lastCustomerMessage: string,
  ) {
    const tenantId = String(conv.tenantId);
    // El aviso puede fallar entero (cuenta caída, WhatsApp sin responder); el
    // chat se deriva igual, porque dejarlo con el agente encendido es peor.
    const { notified, error } = await this.handoff
      .notify(conv, agent, reason, lastCustomerMessage)
      .catch((err: unknown) => ({
        notified: [] as string[],
        error: String(err),
      }));

    conv.autoReply = false;
    conv.escalated = true;
    conv.escalatedAt = new Date();
    conv.escalationReason = reason;
    conv.escalationNotifiedTo = notified;
    conv.takenOverBy = undefined;
    conv.takenOverByName = undefined;
    conv.takenOverAt = new Date();
    await conv.save();

    const detail = reason ? ` Motivo: ${reason}.` : '';
    const who = notified.length
      ? `Se avisó a: ${notified.join(', ')}.`
      : `No se pudo avisar a nadie${error ? ` (${error})` : ''}.`;
    await this.systemNote(
      conv,
      `🔔 El agente IA derivó la conversación a una persona.${detail} ${who} El agente quedó apagado en este chat.`,
    );

    this.gateway.emitConversation(tenantId, conv);
    // Además del aviso a los destinatarios del agente, se avisa al móvil de todo
    // el equipo con acceso a la bandeja: una derivación no puede pasar de largo.
    const handoffTitle = '🔔 Un chat necesita atención';
    const handoffBody = `${this.displayContact(conv)}${reason ? ` · ${reason}` : ''}`;
    const route = `/inbox?c=${String(conv._id)}`;
    void this.push
      .sendToTenant(
        tenantId,
        {
          title: handoffTitle,
          body: handoffBody,
          url: route,
          tag: `handoff-${String(conv._id)}`,
          conversationId: String(conv._id),
          category: 'chats',
        },
        { moduleKey: 'inbox' },
      )
      .catch(() => undefined);
    void this.nativePush
      .sendToTenantModule(tenantId, 'inbox', {
        title: handoffTitle,
        body: handoffBody,
        tag: `handoff_${String(conv._id)}`,
        category: 'chats',
        data: { route, conversationId: String(conv._id) },
      })
      .catch(() => undefined);
    if (error)
      this.logger.warn(
        `Derivación de ${String(conv._id)} con avisos fallidos: ${error}`,
      );
  }

  /**
   * Notificación push por un mensaje entrante, por los dos canales: Web Push
   * (PWA y navegadores, también iPhone) y FCM (app Android). Mismo texto y
   * mismo destino en ambos.
   *
   * Solo la reciben los usuarios cuyo rol tenga el módulo `inbox` (o el dueño
   * del chat, si lo tiene). La etiqueta es la conversación: los mensajes
   * seguidos reemplazan la notificación anterior, que dice cuántos van. Se
   * llama sin `await` y nunca lanza: una push no puede romper la recepción.
   */
  private async notifyInbound(conv: Conversation, msg: Message) {
    try {
      const id = String(conv._id);
      const route = `/inbox?c=${id}`;
      const title = `${this.displayContact(conv)} · ${CHANNEL_LABEL[conv.channel]}`;
      const body = inboundPushBody(
        this.previewOf(msg) || PUSH_HINT_BY_TYPE[msg.type] || 'Nuevo mensaje',
        conv.unreadCount,
      );
      const { total: badge } = await this.unreadTotal(String(conv.tenantId));
      const web = {
        title,
        body,
        url: route,
        tag: `conversation-${id}`,
        conversationId: id,
        category: 'chats' as const,
        badge,
      };
      const native = {
        title,
        body,
        // La app retira las notificaciones con esta etiqueta al abrir el chat.
        tag: `conv_${id}`,
        category: 'chats' as const,
        badge,
        data: { route, conversationId: id, channel: conv.channel },
      };
      // Un chat con dueño solo le avisa a él: al resto del equipo no le toca.
      if (conv.takenOverBy) {
        await Promise.allSettled([
          this.push.sendToUser(String(conv.takenOverBy), web),
          this.nativePush.sendToUser(conv.takenOverBy, native),
        ]);
        return;
      }
      await Promise.allSettled([
        this.push.sendToTenant(String(conv.tenantId), web, {
          moduleKey: 'inbox',
        }),
        this.nativePush.sendToTenantModule(conv.tenantId, 'inbox', native),
      ]);
    } catch (err) {
      this.logger.warn(
        `No se pudo notificar el mensaje entrante de ${String(conv._id)}: ${(err as Error).message}`,
      );
    }
  }

  /** Cómo se nombra al contacto fuera de la bandeja: su nombre o el id del canal. */
  private displayContact(conv: Conversation): string {
    return (
      conv.contactName?.trim() ||
      (conv.channel === 'whatsapp' ? `+${conv.contact}` : conv.contact)
    );
  }

  // ------------------------------------------------------------------
  // Llamadas de WhatsApp (HU6)
  // ------------------------------------------------------------------

  /** Chat de WhatsApp de un contacto en una cuenta, si ya existe. */
  async findWhatsAppChat(
    accountId: string,
    contact: string,
  ): Promise<Conversation | null> {
    return this.convModel
      .findOne({
        channel: 'whatsapp',
        accountId: new Types.ObjectId(accountId),
        contact,
      })
      .exec();
  }

  /**
   * Deja una llamada como evento en el hilo del contacto (lo crea si no
   * existe: una llamada también es una conversación con el cliente).
   */
  async noteCall(
    tenantId: string,
    accountId: string,
    contact: string,
    contactName: string | undefined,
    text: string,
  ): Promise<Conversation> {
    const conv = await this.upsertConversation(
      'whatsapp',
      tenantId,
      accountId,
      { contact, chatId: contact, contactName, type: 'text', at: new Date() },
    );
    const msg = await this.systemNote(conv, text);
    await this.touchConversation(conv, msg);
    return conv;
  }

  /** Mensaje automático al cliente (p. ej. tras una llamada perdida). */
  async sendAutomatic(conv: Conversation, text: string): Promise<void> {
    await this.sendFromAgent(conv, { type: 'text', text });
  }

  /** Nota interna en un chat ya existente (p. ej. permiso de llamada). */
  async noteInChat(conv: Conversation, text: string): Promise<void> {
    await this.systemNote(conv, text);
  }

  /** Nota interna en el hilo: se ve en la bandeja, no se envía al cliente. */
  private async systemNote(conv: Conversation, text: string) {
    const msg = await this.msgModel.create({
      tenantId: conv.tenantId,
      conversationId: conv._id,
      direction: 'out',
      author: 'system',
      type: 'text',
      text,
      status: 'sent',
      at: new Date(),
    });
    this.gateway.emitMessage(String(conv.tenantId), msg);
    return msg;
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

  /** ¿Toca volver a pedir la foto? Sin fecha, sí: nunca se trajo. */
  private avatarCaducado(traidaEl?: Date): boolean {
    if (!traidaEl) return true;
    return Date.now() - traidaEl.getTime() > AVATAR_TTL_MS;
  }

  private async upsertConversation(
    channel: ConversationChannel,
    tenantId: string,
    accountId: string,
    inbound: InboundMessage,
    /** Solo cuando escribe el contacto: así se atribuye a una campaña. */
    attribute = false,
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
      // La foto SIEMPRE se pisa, aunque no haya cambiado de persona: las URLs
      // de Meta llevan firma temporal y caducan. Refrescarla en cada mensaje
      // entrante es lo que la mantiene viva sin re-hospedar la imagen.
      if (inbound.contactAvatar) {
        existing.contactAvatar = inbound.contactAvatar;
        existing.contactAvatarAt = new Date();
      }
      if (inbound.chatId && inbound.chatId !== existing.chatId)
        existing.chatId = inbound.chatId;
      // Atribución de primer toque: si el chat ya vino de un anuncio, un clic
      // posterior en otro no se la quita al que trajo al cliente.
      if (
        hasAttribution(inbound.referral) &&
        !hasAttribution(existing.adReferral)
      )
        existing.adReferral = inbound.referral;
      // Primer toque: un origen ya asignado no se reemplaza.
      if (attribute && !existing.campaign) {
        const campaign = await this.resolveCampaign(channel, tenantId, inbound);
        if (campaign) existing.campaign = campaign;
      }
      return existing;
    }
    const campaign = attribute
      ? await this.resolveCampaign(channel, tenantId, inbound)
      : null;
    return this.convModel.create({
      ...filter,
      tenantId: new Types.ObjectId(tenantId),
      chatId: inbound.chatId,
      contactName: inbound.contactName,
      contactAvatar: inbound.contactAvatar,
      contactAvatarAt: inbound.contactAvatar ? new Date() : undefined,
      adReferral: hasAttribution(inbound.referral)
        ? inbound.referral
        : undefined,
      ...(campaign ? { campaign } : {}),
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
    if (msg.type === 'text')
      return msg.subject && msg.direction === 'in'
        ? `Asunto: ${msg.subject}\n\n${msg.text ?? ''}`
        : (msg.text ?? '');
    if (msg.type === 'location') {
      const place = msg.locationName ? ` (${msg.locationName})` : '';
      return `${AI_HINT_BY_TYPE.location}${place}: ${msg.latitude}, ${msg.longitude}`;
    }
    const hint = AI_HINT_BY_TYPE[msg.type];
    const head = msg.text ? `${hint} con el texto: ${msg.text}` : hint;
    if (!msg.transcript) return head;
    const label = TRANSCRIPT_LABEL[msg.type] ?? 'Contenido del adjunto';
    return `${head}\n${label}: ${msg.transcript}`;
  }

  /**
   * Historial reciente en el formato que espera el agente (excluye el mensaje
   * actual). Incluye lo que escribió una persona en modo manual —desde la
   * bandeja o desde el móvil— para que el agente retome con ese contexto. Las
   * notas internas del sistema no se envían: no las vio el cliente y ocuparían
   * el hueco de mensajes reales.
   */
  private async buildAiHistory(
    conv: Conversation,
    current: Message,
  ): Promise<AiHistoryTurn[]> {
    const docs = await this.msgModel
      .find({
        conversationId: conv._id,
        _id: { $ne: current._id },
        author: { $ne: 'system' },
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

  /** Baja el binario del proveedor. Un fallo aquí no puede perder el mensaje. */
  private async downloadInboundMedia(
    media: InboundMedia,
    download: (
      media: InboundMedia,
    ) => Promise<{ buffer: Buffer; mimeType: string } | null>,
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    try {
      return await download(media);
    } catch (err) {
      this.logger.error(
        `No se pudo descargar la media entrante: ${String(err)}`,
      );
      return null;
    }
  }

  /** Re-hospeda la media entrante en S3 (las URLs del proveedor caducan). */
  private async storeInboundMedia(
    media: InboundMedia,
    file: { buffer: Buffer; mimeType: string },
    channel: ConversationChannel,
  ) {
    try {
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

  /**
   * Convierte el adjunto en texto (transcripción, descripción o contenido) y lo
   * guarda en el mensaje. Se paga una sola vez: el historial de cada turno
   * reutiliza lo guardado en lugar de volver a mandar el archivo al modelo.
   *
   * Corre aunque la conversación esté en manual — el operador también quiere
   * leer la nota de voz sin ponerse los audífonos.
   */
  private async interpretMedia(
    conv: Conversation,
    msg: Message,
    file: { buffer: Buffer; mimeType: string },
  ): Promise<void> {
    const kind = MEDIA_KIND_BY_TYPE[msg.type];
    if (!kind) return;
    try {
      const keys = await this.agents.getTenantApiKeys(conv.tenantId);
      const result = await this.media.interpret(
        {
          kind,
          buffer: file.buffer,
          mimeType: msg.mimeType ?? file.mimeType,
          filename: msg.filename,
        },
        keys,
      );
      if (!result?.text) return;
      msg.transcript = result.text;
      await msg.save();
      this.gateway.emitMessageUpdated(String(conv.tenantId), msg);
    } catch (err) {
      // Un adjunto ilegible no puede impedir que el agente conteste.
      this.logger.warn(`No se pudo interpretar el adjunto: ${String(err)}`);
    }
  }

  private downloadWhatsAppMedia(media: InboundMedia, config: WaConfig) {
    if (media.cloudMediaId)
      return this.wa.downloadCloudMedia(media.cloudMediaId, config);
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
