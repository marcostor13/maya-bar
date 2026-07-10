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
import { AiAgentsService } from './ai-agents.service';
import { InstagramAccountsService } from '../instagram-accounts/instagram-accounts.service';
import { InstagramService } from '../instagram/instagram.service';

/**
 * Endpoint PÚBLICO (sin JWT) que recibe DMs entrantes de Instagram y dispara la
 * respuesta automática del agente publicado vinculado a la cuenta.
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
    private agents: AiAgentsService,
    private accounts: InstagramAccountsService,
    private ig: InstagramService,
    private config: ConfigService,
  ) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const expected = this.config.get<string>('INSTAGRAM_VERIFY_TOKEN');
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
    this.logger.log(`[IG] Inbound payload: ${JSON.stringify(body)}`);
    try {
      const b = body as {
        object?: string;
        entry?: {
          id?: string;
          messaging?: {
            sender?: { id?: string };
            message?: { text?: string; is_echo?: boolean };
          }[];
        }[];
      };
      if (b.object && b.object !== 'instagram') {
        this.logger.warn(
          `[IG] Payload ignorado: object="${b.object}" (esperaba "instagram")`,
        );
        return;
      }
      const entry = b.entry?.[0];
      const igUserId = entry?.id;
      const event = entry?.messaging?.[0];
      const senderId = event?.sender?.id;
      const message = event?.message;
      this.logger.log(
        `[IG] Extraído: igUserId=${igUserId} senderId=${senderId} text="${message?.text}" is_echo=${message?.is_echo}`,
      );
      if (
        !igUserId ||
        !senderId ||
        !message ||
        message.is_echo ||
        !message.text
      ) {
        this.logger.warn(
          '[IG] Payload ignorado: faltan igUserId/senderId/message, o es un echo/sin texto',
        );
        return;
      }
      await this.respond(igUserId, senderId, message.text);
    } catch (err) {
      this.logger.error(`[IG] Error procesando webhook: ${String(err)}`);
    }
  }

  /** Núcleo común: ubica la cuenta y el agente publicado, genera la respuesta y la envía. */
  private async respond(igUserId: string, senderId: string, text: string) {
    const account = await this.accounts.findByIgUserId(igUserId);
    if (!account) {
      this.logger.error(
        `[IG] No se encontró ninguna cuenta conectada con igBusinessAccountId="${igUserId}" — revisa que coincida con el Instagram User ID guardado al conectar la cuenta.`,
      );
      return;
    }
    if (!account.active) {
      this.logger.warn(
        `[IG] Cuenta ${account._id} (${account.label}) está inactiva — no se responde.`,
      );
      return;
    }
    this.logger.log(
      `[IG] Cuenta encontrada: ${account._id} (${account.label})`,
    );

    const agent = await this.agents.findPublishedByInstagramAccount(
      String(account._id),
    );
    if (!agent) {
      this.logger.error(
        `[IG] Sin agente PUBLICADO vinculado a la cuenta de Instagram ${account._id} — revisa Agentes IA → Canales → Instagram, y que "Publicado" esté activo.`,
      );
      return;
    }
    this.logger.log(`[IG] Agente encontrado: ${agent._id} (${agent.name})`);

    // Prefijo para evitar colisión con historiales de contacto de otros canales.
    const contact = `ig:${senderId}`;
    let replyText = '';
    let filesToSend: { url: string; contentType?: string; name: string }[] = [];
    try {
      const result = await this.agents.replyForContact(
        agent,
        String(account._id),
        contact,
        text,
      );
      replyText = result.text;
      filesToSend = result.filesToSend;
      this.logger.log(
        `[IG] Respuesta generada por IA: "${replyText}" (${filesToSend.length} archivo(s))`,
      );
    } catch (err) {
      this.logger.error(
        `[IG] Error generando la respuesta con IA (revisa las API keys del proveedor en Configuración): ${String(err)}`,
      );
      return;
    }

    const config = this.accounts.toConfig(account);

    if (replyText) {
      try {
        await this.ig.sendMessage(senderId, replyText, config);
        this.logger.log(`[IG] Mensaje enviado correctamente a ${senderId}`);
      } catch (err) {
        this.logger.error(
          `[IG] Error enviando el mensaje vía Graph API: ${String(err)}`,
        );
      }
    }

    for (const file of filesToSend) {
      const mediaType = AiAgentsService.resolveMediaType(file.contentType);
      try {
        await this.ig.sendMessage(
          senderId,
          file.name,
          config,
          file.url,
          mediaType,
        );
      } catch (err) {
        this.logger.error(
          `[IG] Error enviando archivo adjunto: ${String(err)}`,
        );
      }
    }
  }
}
