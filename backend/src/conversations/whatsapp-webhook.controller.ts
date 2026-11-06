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
import type { AdReferral } from '../shared/ad-referral';
import { MessageType, MessageStatus } from './message.schema';

/**
 * Endpoints PÚBLICOS (sin JWT) que reciben los mensajes entrantes de WhatsApp,
 * los archivan en la bandeja de entrada y, si el chat está en automático,
 * disparan la respuesta del agente publicado en esa cuenta.
 *
 * Configura en cada proveedor la URL:
 *   Cloud API: GET/POST {API}/wa/webhook/cloud            (nivel de app, verify token = WHATSAPP_VERIFY_TOKEN)
 *              GET/POST {API}/wa/webhook/cloud/:accountId (por cuenta, override_callback_uri, verify token = waVerifyToken)
 *
 * La URL a nivel de app es la que se pega en Meta (App Dashboard → WhatsApp →
 * Configuración) y funciona aunque todavía no exista ninguna cuenta conectada:
 * la cuenta se resuelve con el `phone_number_id` que trae el payload.
 */
@Controller('wa/webhook')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private accounts: WhatsAppAccountsService,
    private conversations: ConversationsService,
  ) {}

  // --- Meta Cloud API (nivel de app): verificación del webhook ---
  @Get('cloud')
  async verifyCloudApp(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    if (mode === 'subscribe' && (await this.accounts.verifyTokenMatches(token)))
      return challenge;
    return 'forbidden';
  }

  // --- Meta Cloud API (nivel de app): mensajes entrantes ---
  @Post('cloud')
  @HttpCode(200)
  cloudAppInbound(@Body() body: unknown) {
    void this.handleCloud(undefined, body);
    return { received: true };
  }

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

  // ------------------------------------------------------------------
  // Meta Cloud API
  // ------------------------------------------------------------------

  private async handleCloud(accountId: string | undefined, body: unknown) {
    try {
      const value = (body as CloudBody).entry?.[0]?.changes?.[0]?.value;
      if (!value) return;

      // Acks de entrega/lectura de los mensajes que enviamos.
      for (const st of value.statuses ?? []) {
        if (st.id && st.status) {
          // Meta acepta el envío y avisa del rechazo después, en este ack: el
          // motivo (ventana de 24 h, número no permitido, bloqueo por país...)
          // solo viaja aquí, así que se guarda para verlo en la bandeja.
          const error = this.cloudError(st.errors);
          if (error)
            this.logger.warn(
              `[WA] Mensaje ${st.id} a ${st.recipient_id ?? '?'} rechazado por Meta: ${error}`,
            );
          await this.conversations.handleAck(
            st.id,
            this.cloudStatus(st.status),
            error,
          );
        }
      }

      const raw = value.messages?.[0];
      if (!raw) return;

      // Con la URL a nivel de app no viene accountId: se resuelve por el número que recibió el mensaje.
      const phoneNumberId = value.metadata?.phone_number_id;
      const account = accountId
        ? await this.accounts.findById(accountId)
        : phoneNumberId
          ? await this.accounts.findByPhoneNumberId(phoneNumberId)
          : null;
      if (!account || !account.active) {
        this.logger.warn(
          `[WA] Cuenta ${accountId ?? `phone_number_id=${phoneNumberId ?? '?'}`} inexistente o inactiva — mensaje descartado.`,
        );
        return;
      }

      const sender = value.contacts?.[0];
      const inbound = this.parseCloudMessage(
        raw,
        sender?.profile?.name ?? sender?.profile?.username,
        sender,
      );
      if (!inbound) return;
      if (!inbound.contact) {
        this.logger.warn(
          `[WA] Mensaje ${raw.id ?? '?'} sin remitente identificable — descartado. Claves: ${Object.keys(raw).join(',')} | contacto: ${Object.keys(sender ?? {}).join(',')}`,
        );
        return;
      }
      if (inbound.type === 'unsupported')
        this.logger.warn(
          `[WA] Mensaje ${raw.id ?? '?'} de tipo "${raw.type ?? '?'}" no soportado: ${this.cloudError(raw.errors) ?? 'sin detalle'}`,
        );
      await this.conversations.handleWhatsAppInbound(account, inbound);
    } catch (err) {
      this.logger.error(
        `[WA] Error en el webhook de Cloud API: ${String(err)}`,
      );
    }
  }

  /**
   * Traduce el mensaje de la Cloud API. Devuelve null para lo que no es un
   * mensaje del cliente (avisos de apertura de chat, mensajes efímeros,
   * reacciones retiradas) y no debe aparecer en la bandeja.
   */
  private parseCloudMessage(
    msg: CloudMessage,
    profileName?: string,
    sender?: CloudContact,
  ): InboundMessage | null {
    // Quien usa username de WhatsApp puede llegar sin teléfono (`from`): solo
    // con su BSUID (`from_user_id`, p. ej. "PE.1502576394655843"). Ese id es
    // el contacto y a él se responde (el envío lo manda en `recipient`).
    const contact =
      msg.from ?? sender?.wa_id ?? msg.from_user_id ?? sender?.user_id ?? '';
    const base: InboundMessage = {
      contact,
      chatId: contact || undefined,
      contactName: profileName,
      externalId: msg.id,
      type: 'unsupported',
      rawType: msg.type,
      at: msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date(),
      referral: this.cloudReferral(msg),
    };
    if (msg.type && CLOUD_IGNORED_TYPES.has(msg.type)) return null;

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

      // Sin emoji es una reacción que el cliente retiró: no hay nada que mostrar.
      case 'reaction':
        return msg.reaction?.emoji
          ? { ...base, type: 'text', text: msg.reaction.emoji }
          : null;

      case 'order': {
        const items = (msg.order?.product_items ?? []).map(
          (i) =>
            `• ${i.quantity ?? 1} × ${i.product_retailer_id ?? 'producto'}` +
            (i.item_price != null
              ? ` (${[i.item_price, i.currency].filter(Boolean).join(' ')})`
              : ''),
        );
        return {
          ...base,
          type: 'text',
          text: [
            `Pedido del catálogo (${items.length} producto${items.length === 1 ? '' : 's'}):`,
            ...items,
            msg.order?.text ?? '',
          ]
            .filter(Boolean)
            .join('\n'),
        };
      }

      // Aviso del propio WhatsApp, p.ej. "el cliente cambió de número".
      case 'system':
        return {
          ...base,
          type: 'text',
          text: `Aviso de WhatsApp: ${msg.system?.body ?? 'cambio en la cuenta del cliente'}`,
          noAgent: true,
        };

      default:
        return base;
    }
  }

  /**
   * Anuncio del que viene el chat. Meta solo lo manda en el PRIMER mensaje que
   * el cliente escribe tras pulsar un anuncio de Click-to-WhatsApp: si no se
   * guarda aquí, la conversión que venga después no se puede atribuir.
   */
  private cloudReferral(msg: CloudMessage): AdReferral | undefined {
    const ref = msg.referral;
    if (!ref?.ctwa_clid && !ref?.source_id) return undefined;
    return {
      ctwaClid: ref.ctwa_clid,
      adId: ref.source_id,
      sourceType: ref.source_type,
      sourceUrl: ref.source_url,
      headline: ref.headline,
      body: ref.body,
      at: new Date(),
    };
  }

  /** `#131049 Mensaje no entregado...`: código y detalle del primer error de Meta. */
  private cloudError(errors?: CloudStatusError[]): string | undefined {
    const e = errors?.[0];
    if (!e) return undefined;
    const detail = e.error_data?.details ?? e.message ?? e.title ?? '';
    return `#${e.code ?? '?'} ${e.title ?? ''}${detail && detail !== e.title ? ` — ${detail}` : ''}`.trim();
  }

  private cloudStatus(status: string): MessageStatus {
    if (status === 'read') return 'read';
    if (status === 'delivered') return 'delivered';
    if (status === 'failed') return 'failed';
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

/**
 * Lo que la Cloud API manda por el webhook de mensajes y no es un mensaje del
 * cliente: aviso de que abrió el chat por primera vez y mensajes efímeros
 * (desaparecen y Meta no entrega su contenido).
 */
const CLOUD_IGNORED_TYPES = new Set(['request_welcome', 'ephemeral']);

/** Remitente en `value.contacts`. Con username, `wa_id` puede faltar. */
interface CloudContact {
  wa_id?: string;
  /** BSUID: id del usuario para este portafolio de negocio. */
  user_id?: string;
  profile?: { name?: string; username?: string };
}

interface CloudMessage {
  from?: string;
  /** BSUID del remitente; único identificador si no se comparte el teléfono. */
  from_user_id?: string;
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
  order?: {
    text?: string;
    product_items?: {
      product_retailer_id?: string;
      quantity?: number;
      item_price?: number;
      currency?: string;
    }[];
  };
  system?: { body?: string; type?: string };
  /** Detalle de Meta cuando `type` es "unsupported". */
  errors?: CloudStatusError[];
  /** Anuncio de origen (Click-to-WhatsApp); solo viene en el primer mensaje. */
  referral?: {
    source_url?: string;
    source_id?: string;
    source_type?: string;
    headline?: string;
    body?: string;
    ctwa_clid?: string;
  };
}

interface CloudStatusError {
  code?: number;
  title?: string;
  message?: string;
  error_data?: { details?: string };
}

interface CloudBody {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: CloudContact[];
        messages?: CloudMessage[];
        statuses?: {
          id?: string;
          status?: string;
          recipient_id?: string;
          errors?: CloudStatusError[];
        }[];
      };
    }[];
  }[];
}
