import { Controller, Get, Post, Query, Body, Logger, HttpCode } from '@nestjs/common';
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
      const b = body as {
        entry?: {
          id?: string;
          messaging?: {
            sender?: { id?: string };
            message?: { text?: string; is_echo?: boolean };
          }[];
        }[];
      };
      const entry = b.entry?.[0];
      const igUserId = entry?.id;
      const event = entry?.messaging?.[0];
      const senderId = event?.sender?.id;
      const message = event?.message;
      if (!igUserId || !senderId || !message || message.is_echo || !message.text) return;
      await this.respond(igUserId, senderId, message.text);
    } catch (err) {
      this.logger.error(`Instagram webhook error: ${String(err)}`);
    }
  }

  /** Núcleo común: ubica la cuenta y el agente publicado, genera la respuesta y la envía. */
  private async respond(igUserId: string, senderId: string, text: string) {
    const account = await this.accounts.findByIgUserId(igUserId);
    if (!account || !account.active) return;
    const agent = await this.agents.findPublishedByInstagramAccount(String(account._id));
    if (!agent) {
      this.logger.warn(`Sin agente publicado para la cuenta de Instagram ${account._id}`);
      return;
    }
    // Prefijo para evitar colisión con historiales de contacto de otros canales.
    const contact = `ig:${senderId}`;
    const { text: replyText, filesToSend } = await this.agents.replyForContact(agent, String(account._id), contact, text);
    const config = this.accounts.toConfig(account);

    if (replyText) {
      await this.ig.sendMessage(senderId, replyText, config);
    }

    for (const file of filesToSend) {
      const mediaType = AiAgentsService.resolveMediaType(file.contentType);
      await this.ig.sendMessage(senderId, file.name, config, file.url, mediaType);
    }
  }
}
