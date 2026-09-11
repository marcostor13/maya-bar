import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Logger,
  HttpCode,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessengerAccountsService } from '../messenger-accounts/messenger-accounts.service';
import { ConversationsService, InboundMessage } from './conversations.service';
import { MessageType } from './message.schema';

/**
 * Endpoint PÚBLICO (sin JWT) que recibe los mensajes entrantes de Messenger, los
 * archiva en la bandeja de entrada y dispara la respuesta del agente si el chat
 * está en automático.
 *
 * Meta permite UNA sola URL de webhook por app (no una por Página conectada) —
 * el payload trae `entry[].id` con el Page ID que recibió el mensaje, y con eso
 * se ubica la cuenta y el tenant correspondientes.
 *
 * Configura en Meta (App Dashboard → Messenger → Webhooks):
 *   URL:          {PUBLIC_API_URL}/messenger/webhook
 *   Verify token: MESSENGER_VERIFY_TOKEN (variable de entorno del backend)
 */
@Controller('messenger/webhook')
export class MessengerWebhookController {
  private readonly logger = new Logger(MessengerWebhookController.name);

  constructor(
    private accounts: MessengerAccountsService,
    private conversations: ConversationsService,
    private config: ConfigService,
  ) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const expected = this.config.get<string>('MESSENGER_VERIFY_TOKEN');
    if (mode === 'subscribe' && expected && token === expected)
      return challenge;
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
      const b = body as MsBody;
      if (b.object && b.object !== 'page') {
        this.logger.warn(
          `[MS] Payload ignorado: object="${b.object}" (esperaba "page")`,
        );
        return;
      }
      const entry = b.entry?.[0];
      const pageId = entry?.id;
      const event = entry?.messaging?.[0];
      const message = event?.message;
      if (!pageId || !event || !message || message.is_deleted) return;

      // En un eco el remitente es la propia Página: quien importa es el destinatario.
      const isEcho = message.is_echo === true;
      const contactId = isEcho ? event.recipient?.id : event.sender?.id;
      if (!contactId) return;

      const account = await this.accounts.findByPageId(pageId);
      if (!account) {
        this.logger.error(
          `[MS] No hay cuenta conectada con pageId="${pageId}".`,
        );
        return;
      }
      if (!account.active) {
        this.logger.warn(
          `[MS] Cuenta ${String(account._id)} (${account.label}) inactiva — no se responde.`,
        );
        return;
      }

      await this.conversations.handleMessengerInbound(
        account,
        this.parse(contactId, event, isEcho),
      );
    } catch (err) {
      this.logger.error(`[MS] Error procesando el webhook: ${String(err)}`);
    }
  }

  private parse(
    contactId: string,
    event: MsMessaging,
    isEcho: boolean,
  ): InboundMessage {
    const message = event.message ?? {};
    const base: InboundMessage = {
      contact: contactId,
      externalId: message.mid,
      type: 'text',
      text: message.text ?? '',
      at: event.timestamp ? new Date(event.timestamp) : new Date(),
      fromMe: isEcho || undefined,
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
        return 'image';
      case 'video':
        return 'video';
      case 'audio':
        return 'audio';
      case 'file':
        return 'document';
      case 'location':
        return 'location';
      default:
        return 'unsupported';
    }
  }
}

interface MsMessaging {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    is_deleted?: boolean;
    attachments?: { type?: string; payload?: { url?: string } }[];
  };
}

interface MsBody {
  object?: string;
  entry?: { id?: string; messaging?: MsMessaging[] }[];
}
