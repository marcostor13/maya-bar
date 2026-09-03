import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Conversation } from './conversation.schema';
import { AiAgent } from '../ai-agents/ai-agent.schema';
import { WhatsAppService, WaConfig } from '../whatsapp/whatsapp.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';

/** Resultado del aviso a los agentes humanos. */
export interface HandoffNotifyResult {
  notified: string[];
  error?: string;
}

const LAST_MESSAGE_MAX = 220;

/**
 * Avisa por WhatsApp a las personas configuradas en el agente cuando la IA
 * deriva una conversación, con el enlace directo al chat en la plataforma.
 */
@Injectable()
export class HandoffService {
  private readonly logger = new Logger(HandoffService.name);

  constructor(
    private wa: WhatsAppService,
    private waAccounts: WhatsAppAccountsService,
    private config: ConfigService,
  ) {}

  /** Enlace al chat dentro de la bandeja de entrada de la plataforma. */
  conversationLink(conv: Conversation): string {
    const base = (this.config.get<string>('FRONTEND_URL') ?? '').replace(
      /\/$/,
      '',
    );
    return base ? `${base}/inbox?c=${String(conv._id)}` : '';
  }

  /**
   * Cuenta de WhatsApp desde la que sale el aviso: la que fijó el agente, la de
   * la propia conversación (si es de WhatsApp) o la predeterminada del tenant.
   */
  private async resolveSenderConfig(
    conv: Conversation,
    agent: AiAgent,
  ): Promise<WaConfig | null> {
    const account =
      (agent.handoffAccountId
        ? await this.waAccounts.findById(String(agent.handoffAccountId))
        : null) ??
      (conv.channel === 'whatsapp'
        ? await this.waAccounts.findById(String(conv.accountId))
        : null) ??
      (await this.waAccounts.getDefault(String(conv.tenantId)));
    if (!account) return null;
    return this.waAccounts.toConfig(account);
  }

  /** Texto del aviso que recibe el agente humano. */
  buildNotice(
    conv: Conversation,
    reason: string | undefined,
    lastMessage: string,
  ): string {
    const who = conv.contactName?.trim() || 'Cliente';
    const from =
      conv.channel === 'instagram'
        ? `Instagram · ${conv.contact}`
        : `+${conv.contact}`;
    const link = this.conversationLink(conv);
    return [
      '🔔 *Un chat necesita atención humana*',
      '',
      `*Cliente:* ${who} (${from})`,
      reason ? `*Motivo:* ${reason}` : null,
      lastMessage ? `*Último mensaje:* “${this.trim(lastMessage)}”` : null,
      '',
      'El agente IA quedó apagado en esta conversación.',
      link ? `Entra a la plataforma para continuarla:\n${link}` : null,
    ]
      .filter((l) => l !== null)
      .join('\n');
  }

  private trim(text: string): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > LAST_MESSAGE_MAX
      ? `${clean.slice(0, LAST_MESSAGE_MAX)}…`
      : clean;
  }

  /**
   * Envía el aviso a cada número configurado. Devuelve a quiénes se les avisó:
   * si un número falla, se sigue con los demás (nunca bloquea la derivación).
   */
  async notify(
    conv: Conversation,
    agent: AiAgent,
    reason: string | undefined,
    lastMessage: string,
  ): Promise<HandoffNotifyResult> {
    const numbers = (agent.handoffNumbers ?? []).filter(Boolean);
    if (numbers.length === 0)
      return {
        notified: [],
        error: 'El agente no tiene números de aviso configurados',
      };

    const config = await this.resolveSenderConfig(conv, agent);
    if (!config)
      return {
        notified: [],
        error: 'No hay una cuenta de WhatsApp disponible para enviar el aviso',
      };

    const body = this.buildNotice(conv, reason, lastMessage);
    const notified: string[] = [];
    const errors: string[] = [];

    for (const number of numbers) {
      try {
        if (config.provider === 'cloudapi' && agent.handoffTemplateName) {
          // Fuera de la ventana de 24 h Meta solo acepta plantillas aprobadas.
          await this.wa.sendCloudApiTemplate(
            number,
            agent.handoffTemplateName,
            agent.handoffTemplateLang || 'es',
            [
              conv.contactName?.trim() || `+${conv.contact}`,
              reason || 'El cliente pidió hablar con una persona',
              this.conversationLink(conv) || 'la plataforma',
            ],
            config,
          );
        } else {
          await this.wa.sendMessage(number, body, config);
        }
        notified.push(number);
      } catch (err) {
        errors.push(`${number}: ${String(err)}`);
        this.logger.error(
          `No se pudo avisar al agente humano ${number}: ${String(err)}`,
        );
      }
    }

    return { notified, error: errors.length ? errors.join(' | ') : undefined };
  }
}
