import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Logger,
  HttpCode,
} from '@nestjs/common';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { ConversationsService, InboundMessage } from './conversations.service';
import { MessageType, MessageStatus } from './message.schema';

/**
 * Endpoints PÚBLICOS (sin JWT) que reciben los mensajes entrantes de WhatsApp,
 * los archivan en la bandeja de entrada y, si el chat está en automático,
 * disparan la respuesta del agente publicado en esa cuenta.
 *
 * Configura en cada proveedor la URL:
 *   WAHA:      POST {API}/wa/webhook/waha/:accountId
 *   Cloud API: GET/POST {API}/wa/webhook/cloud/:accountId  (verify token = waVerifyToken)
 */
@Controller('wa/webhook')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private accounts: WhatsAppAccountsService,
    private conversations: ConversationsService,
  ) {}

  // --- Meta Cloud API: verificación del webhook ---
  @Get('cloud/:accountId')
  async verifyCloud(
    @Param('accountId') accountId: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const account = await this.accounts.findById(accountId);
    if (
      mode === 'subscribe' &&
      account &&
      token &&
      token === account.waVerifyToken
    ) {
      return challenge;
    }
    return 'forbidden';
  }

  // --- Meta Cloud API: mensajes entrantes ---
  @Post('cloud/:accountId')
  @HttpCode(200)
  cloudInbound(@Param('accountId') accountId: string, @Body() body: unknown) {
    void this.handleCloud(accountId, body);
    return { received: true };
  }

  // --- WAHA: mensajes entrantes ---
  @Post('waha/:accountId')
  @HttpCode(200)
  wahaInbound(@Param('accountId') accountId: string, @Body() body: unknown) {
    void this.handleWaha(accountId, body);
    return { received: true };
  }

  // ------------------------------------------------------------------
  // Meta Cloud API
  // ------------------------------------------------------------------

  private async handleCloud(accountId: string, body: unknown) {
    try {
      const value = (body as CloudBody).entry?.[0]?.changes?.[0]?.value;
      if (!value) return;

      // Acks de entrega/lectura de los mensajes que enviamos.
      for (const st of value.statuses ?? []) {
        if (st.id && st.status) {
          await this.conversations.handleAck(
            st.id,
            this.cloudStatus(st.status),
          );
        }
      }

      const raw = value.messages?.[0];
      if (!raw) return;

      const account = await this.accounts.findById(accountId);
      if (!account || !account.active) {
        this.logger.warn(
          `[WA] Cuenta ${accountId} inexistente o inactiva — mensaje descartado.`,
        );
        return;
      }

      const inbound = this.parseCloudMessage(
        raw,
        value.contacts?.[0]?.profile?.name,
      );
      await this.conversations.handleWhatsAppInbound(account, inbound);
    } catch (err) {
      this.logger.error(
        `[WA] Error en el webhook de Cloud API: ${String(err)}`,
      );
    }
  }

  private parseCloudMessage(
    msg: CloudMessage,
    profileName?: string,
  ): InboundMessage {
    const base: InboundMessage = {
      contact: msg.from ?? '',
      chatId: msg.from,
      contactName: profileName,
      externalId: msg.id,
      type: 'unsupported',
      at: msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date(),
    };

    switch (msg.type) {
      case 'text':
        return { ...base, type: 'text', text: msg.text?.body ?? '' };

      case 'image':
      case 'video':
      case 'document':
      case 'sticker': {
        const media = msg[msg.type];
        const type: MessageType = msg.type;
        return {
          ...base,
          type,
          text: media?.caption ?? '',
          media: {
            cloudMediaId: media?.id,
            mimeType: media?.mime_type,
            filename: media?.filename,
          },
        };
      }

      case 'audio': {
        const media = msg.audio;
        return {
          ...base,
          // WhatsApp marca las notas de voz con `voice: true`.
          type: media?.voice ? 'voice' : 'audio',
          media: { cloudMediaId: media?.id, mimeType: media?.mime_type },
        };
      }

      case 'location':
        return {
          ...base,
          type: 'location',
          latitude: msg.location?.latitude,
          longitude: msg.location?.longitude,
          locationName: msg.location?.name ?? msg.location?.address,
        };

      case 'contacts':
        return {
          ...base,
          type: 'contact',
          text: (msg.contacts ?? [])
            .map((c) => {
              const phones = (c.phones ?? [])
                .map((p) => p.phone)
                .filter(Boolean)
                .join(', ');
              return [c.name?.formatted_name, phones]
                .filter(Boolean)
                .join(' — ');
            })
            .join('\n'),
        };

      // Respuestas a botones/listas interactivas llegan como texto plano.
      case 'button':
        return { ...base, type: 'text', text: msg.button?.text ?? '' };

      case 'interactive':
        return {
          ...base,
          type: 'text',
          text:
            msg.interactive?.button_reply?.title ??
            msg.interactive?.list_reply?.title ??
            '',
        };

      case 'reaction':
        return { ...base, type: 'text', text: msg.reaction?.emoji ?? '' };

      default:
        return base;
    }
  }

  private cloudStatus(status: string): MessageStatus {
    if (status === 'read') return 'read';
    if (status === 'delivered') return 'delivered';
    if (status === 'failed') return 'failed';
    return 'sent';
  }

  // ------------------------------------------------------------------
  // WAHA
  // ------------------------------------------------------------------

  private async handleWaha(accountId: string, body: unknown) {
    try {
      const b = body as WahaBody;
      const event = b.event ?? 'message';
      const p = b.payload;
      if (!p) return;

      if (event === 'message.ack') {
        const id = this.wahaId(p.id);
        if (id)
          await this.conversations.handleAck(
            id,
            this.wahaStatus(p.ack, p.ackName),
          );
        return;
      }

      // `message.any` duplica los entrantes que ya llegan por `message`:
      // de ahí solo interesan los que el negocio envió desde su móvil.
      if (event === 'message.any' && !p.fromMe) return;
      if (event === 'message' && p.fromMe) return;
      if (event !== 'message' && event !== 'message.any') return;

      const account = await this.accounts.findById(accountId);
      if (!account || !account.active) {
        this.logger.warn(
          `[WA] Cuenta ${accountId} inexistente o inactiva — mensaje descartado.`,
        );
        return;
      }

      const inbound = this.parseWahaMessage(p);
      if (!inbound.contact) return;
      // Los chats de grupo no tienen un destinatario individual al que responder.
      if (inbound.chatId?.includes('@g.us')) return;
      await this.conversations.handleWhatsAppInbound(account, inbound);
    } catch (err) {
      this.logger.error(`[WA] Error en el webhook de WAHA: ${String(err)}`);
    }
  }

  private parseWahaMessage(p: WahaPayload): InboundMessage {
    // En los ecos (fromMe) el interlocutor es el destinatario, no el remitente.
    const chatId = (p.fromMe ? p.to : p.from) ?? p.from ?? '';
    const contact = chatId
      .replace('@c.us', '')
      .replace('@s.whatsapp.net', '')
      .replace('@g.us', '');
    const mime = p.media?.mimetype ?? p._data?.mimetype;

    const base: InboundMessage = {
      contact,
      chatId,
      contactName: p._data?.notifyName ?? p.notifyName,
      externalId: this.wahaId(p.id),
      fromMe: p.fromMe === true,
      type: 'text',
      text: p.body ?? '',
      at: p.timestamp ? new Date(p.timestamp * 1000) : new Date(),
    };

    const rawType = p.type ?? p._data?.type;

    if (rawType === 'location' || p.location) {
      return {
        ...base,
        type: 'location',
        text: '',
        latitude: p.location?.latitude ?? p._data?.lat,
        longitude: p.location?.longitude ?? p._data?.lng,
        locationName: p.location?.description ?? p._data?.loc,
      };
    }

    if (
      rawType === 'vcard' ||
      rawType === 'multi_vcard' ||
      (p.vCards?.length ?? 0) > 0
    ) {
      return {
        ...base,
        type: 'contact',
        text: (p.vCards ?? []).join('\n') || (p.body ?? ''),
      };
    }

    if (p.hasMedia && p.media?.url) {
      return {
        ...base,
        type: this.wahaMediaType(rawType, mime),
        // En WAHA el caption viene en `body` junto con la media.
        text: p.body ?? '',
        media: {
          downloadUrl: p.media.url,
          mimeType: mime,
          filename: p.media.filename ?? p._data?.filename,
        },
      };
    }

    if (!base.text) return { ...base, type: 'unsupported' };
    return base;
  }

  private wahaMediaType(rawType?: string, mime?: string): MessageType {
    if (rawType === 'ptt') return 'voice';
    if (rawType === 'sticker') return 'sticker';
    if (rawType === 'image') return 'image';
    if (rawType === 'video') return 'video';
    if (rawType === 'audio') return 'audio';
    if (rawType === 'document') return 'document';
    if (mime?.startsWith('image/'))
      return mime === 'image/webp' ? 'sticker' : 'image';
    if (mime?.startsWith('video/')) return 'video';
    if (mime?.startsWith('audio/')) return 'audio';
    return 'document';
  }

  /** `id` puede llegar como string serializado o como objeto. */
  private wahaId(id?: string | { _serialized?: string }): string | undefined {
    if (!id) return undefined;
    return typeof id === 'string' ? id : id._serialized;
  }

  /** ack: -1 error · 1 servidor · 2 entregado · 3 leído · 4 reproducido. */
  private wahaStatus(ack?: number, ackName?: string): MessageStatus {
    if (ack === -1 || ackName === 'ERROR') return 'failed';
    if ((ack ?? 0) >= 3 || ackName === 'READ' || ackName === 'PLAYED')
      return 'read';
    if (ack === 2 || ackName === 'DEVICE') return 'delivered';
    return 'sent';
  }
}

// ---- Formas mínimas de los payloads de cada proveedor ----

interface CloudMedia {
  id?: string;
  mime_type?: string;
  caption?: string;
  filename?: string;
  voice?: boolean;
}

interface CloudMessage {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: CloudMedia;
  video?: CloudMedia;
  audio?: CloudMedia;
  document?: CloudMedia;
  sticker?: CloudMedia;
  location?: {
    latitude?: number;
    longitude?: number;
    name?: string;
    address?: string;
  };
  contacts?: {
    name?: { formatted_name?: string };
    phones?: { phone?: string }[];
  }[];
  button?: { text?: string; payload?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
  reaction?: { emoji?: string; message_id?: string };
}

interface CloudBody {
  entry?: {
    changes?: {
      value?: {
        contacts?: { profile?: { name?: string }; wa_id?: string }[];
        messages?: CloudMessage[];
        statuses?: { id?: string; status?: string }[];
      };
    }[];
  }[];
}

interface WahaPayload {
  id?: string | { _serialized?: string };
  timestamp?: number;
  from?: string;
  to?: string;
  fromMe?: boolean;
  body?: string;
  type?: string;
  notifyName?: string;
  hasMedia?: boolean;
  media?: { url?: string; mimetype?: string; filename?: string };
  location?: { latitude?: number; longitude?: number; description?: string };
  vCards?: string[];
  ack?: number;
  ackName?: string;
  _data?: {
    type?: string;
    notifyName?: string;
    mimetype?: string;
    filename?: string;
    lat?: number;
    lng?: number;
    loc?: string;
  };
}

interface WahaBody {
  event?: string;
  payload?: WahaPayload;
}
