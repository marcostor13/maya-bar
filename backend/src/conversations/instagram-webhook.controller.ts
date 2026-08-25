import { Controller, Get, Post, Query, Body, Logger, HttpCode } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InstagramAccountsService } from '../instagram-accounts/instagram-accounts.service';
import { ConversationsService, InboundMessage } from './conversations.service';
import { MessageType } from './message.schema';

/**
 * Endpoint PÚBLICO (sin JWT) que recibe los DMs entrantes de Instagram, los archiva
 * en la bandeja de entrada y dispara la respuesta del agente si el chat está en automático.
 *
 * Meta permite UNA sola URL de webhook por app (no una por cuenta conectada) —
 * el payload trae `entry[].id` con el Instagram User ID de la cuenta que recibió
 * el mensaje, y con eso se ubica la cuenta y el tenant correspondientes.
 *
 * Configura en Meta (App Dashboard → Instagram → Webhooks):
 *   URL:          {PUBLIC_API_URL}/ig/webhook
 *   Verify token: INSTAGRAM_VERIFY_TOKEN (variable de entorno del backend)
 */
@Controller('ig/webhook')
export class InstagramWebhookController {
  private readonly logger = new Logger(InstagramWebhookController.name);

  constructor(
    private accounts: InstagramAccountsService,
    private conversations: ConversationsService,
    private config: ConfigService,
  ) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const expected = this.config.get<string>('INSTAGRAM_VERIFY_TOKEN');
    if (mode === 'subscribe' && expected && token === expected) return challenge;
    return 'forbidden';
  }

  @Post()
  @HttpCode(200)
  inbound(@Body() body: unknown) {
    void this.handleInbound(body);
    return { received: true };
  }

  private async handleInbound(body: unknown) {
    try {
      const b = body as IgBody;
      if (b.object && b.object !== 'instagram') {
        this.logger.warn(`[IG] Payload ignorado: object="${b.object}" (esperaba "instagram")`);
        return;
      }
      const entry = b.entry?.[0];
      const igUserId = entry?.id;
      const event = entry?.messaging?.[0];
      const senderId = event?.sender?.id;
      const message = event?.message;
      if (!igUserId || !senderId || !message || message.is_echo || message.is_deleted) return;

      const account = await this.accounts.findByIgUserId(igUserId);
      if (!account) {
        this.logger.error(`[IG] No hay cuenta conectada con igBusinessAccountId="${igUserId}".`);
        return;
      }
      if (!account.active) {
        this.logger.warn(`[IG] Cuenta ${String(account._id)} (${account.label}) inactiva — no se responde.`);
        return;
      }

      await this.conversations.handleInstagramInbound(account, this.parse(senderId, event));
    } catch (err) {
      this.logger.error(`[IG] Error procesando el webhook: ${String(err)}`);
    }
  }

  private parse(senderId: string, event: IgMessaging): InboundMessage {
    const message = event.message ?? {};
    const base: InboundMessage = {
      contact: senderId,
      externalId: message.mid,
      type: 'text',
      text: message.text ?? '',
      at: event.timestamp ? new Date(event.timestamp) : new Date(),
    };

    const attachment = message.attachments?.[0];
    if (!attachment?.payload?.url) return base;

    return {
      ...base,
      type: this.attachmentType(attachment.type),
      media: { downloadUrl: attachment.payload.url },
    };
  }

  private attachmentType(type?: string): MessageType {
    switch (type) {
      case 'image':
      case 'story_mention':
      case 'share':
        return 'image';
      case 'video':
      case 'ig_reel':
        return 'video';
      case 'audio':
        return 'audio';
      case 'file':
        return 'document';
      default:
        return 'unsupported';
    }
  }
}

interface IgMessaging {
  sender?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    is_deleted?: boolean;
    attachments?: { type?: string; payload?: { url?: string } }[];
  };
}

interface IgBody {
  object?: string;
  entry?: { id?: string; messaging?: IgMessaging[] }[];
}
