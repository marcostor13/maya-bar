import { Controller, Get, Post, Param, Query, Body, Logger, HttpCode } from '@nestjs/common';
import { AiAgentsService } from './ai-agents.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

/**
 * Endpoints PÚBLICOS (sin JWT) que reciben mensajes entrantes de WhatsApp y
 * disparan la respuesta automática del agente publicado vinculado a la cuenta.
 *
 * Configura en cada proveedor la URL:
 *   WAHA:      POST {API}/wa/webhook/waha/:accountId
 *   Cloud API: GET/POST {API}/wa/webhook/cloud/:accountId  (verify token = waVerifyToken)
 */
@Controller('wa/webhook')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private agents: AiAgentsService,
    private accounts: WhatsAppAccountsService,
    private wa: WhatsAppService,
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
    if (mode === 'subscribe' && account && token && token === account.waVerifyToken) {
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

  private async handleCloud(accountId: string, body: unknown) {
    try {
      const b = body as {
        entry?: { changes?: { value?: { messages?: { from?: string; type?: string; text?: { body?: string } }[] } }[] }[];
      };
      const change = b.entry?.[0]?.changes?.[0]?.value;
      const msg = change?.messages?.[0];
      if (!msg || msg.type !== 'text' || !msg.from || !msg.text?.body) return;
      await this.respond(accountId, msg.from, msg.text.body);
    } catch (err) {
      this.logger.error(`Cloud webhook error: ${String(err)}`);
    }
  }

  private async handleWaha(accountId: string, body: unknown) {
    try {
      const b = body as {
        event?: string;
        payload?: { from?: string; body?: string; fromMe?: boolean };
      };
      if (b.event && b.event !== 'message') return;
      const p = b.payload;
      if (!p || p.fromMe || !p.from || !p.body) return;
      const contact = p.from.replace('@c.us', '').replace('@s.whatsapp.net', '');
      await this.respond(accountId, contact, p.body);
    } catch (err) {
      this.logger.error(`WAHA webhook error: ${String(err)}`);
    }
  }

  /** Núcleo común: ubica agente publicado, genera respuesta y la envía. */
  private async respond(accountId: string, contact: string, text: string) {
    const account = await this.accounts.findById(accountId);
    if (!account || !account.active) return;
    const agent = await this.agents.findPublishedByAccount(accountId);
    if (!agent) {
      this.logger.warn(`Sin agente publicado para la cuenta ${accountId}`);
      return;
    }
    const { text: replyText, filesToSend } = await this.agents.replyForContact(agent, accountId, contact, text);
    const config = this.accounts.toConfig(account);

    if (replyText) {
      await this.wa.sendMessage(contact, replyText, config);
    }

    for (const file of filesToSend) {
      const mediaType = AiAgentsService.resolveMediaType(file.contentType);
      await this.wa.sendMessage(contact, file.name, config, file.url, mediaType);
    }
  }
}
