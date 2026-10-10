import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Conversation } from './conversation.schema';
import { AiAgent, HandoffTarget } from '../ai-agents/ai-agent.schema';
import { WhatsAppService, WaConfig } from '../whatsapp/whatsapp.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { EmailAccountsService } from '../email-accounts/email-accounts.service';
import { EmailTransportService } from '../email-accounts/email-transport.service';
import { EmailAccount } from '../email-accounts/email-account.schema';
import { textToHtml } from '../email-accounts/email-message';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';

/** Resultado del aviso a los agentes humanos. */
export interface HandoffNotifyResult {
  /** A quién se avisó, con su canal: "WhatsApp +51…", "correo a@b.c", "SMS +51…". */
  notified: string[];
  error?: string;
}

const LAST_MESSAGE_MAX = 220;
const SMS_REASON_MAX = 60;

const CHANNEL_LABELS: Record<string, string> = {
  messenger: 'Messenger',
  instagram: 'Instagram',
  email: 'Correo',
};

/** Cómo se nombra a un destinatario en la nota del chat y en los errores. */
export function handoffTargetLabel(target: HandoffTarget): string {
  if (target.channel === 'email') return `correo ${target.to}`;
  return `${target.channel === 'sms' ? 'SMS' : 'WhatsApp'} +${target.to}`;
}

/**
 * Avisa a las personas configuradas en el agente cuando la IA deriva una
 * conversación, con el enlace directo al chat en la plataforma. Cada
 * destinatario elige su canal (WhatsApp, correo o SMS) y, si quiere, la cuenta
 * desde la que sale.
 */
@Injectable()
export class HandoffService {
  private readonly logger = new Logger(HandoffService.name);

  constructor(
    private wa: WhatsAppService,
    private waAccounts: WhatsAppAccountsService,
    private emailAccounts: EmailAccountsService,
    private emailTransport: EmailTransportService,
    private mail: MailService,
    private sms: SmsService,
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
   * Destinatarios del aviso: los de `handoffTargets` más los números de
   * `handoffNumbers` (agentes configurados antes de poder elegir canal).
   */
  targets(agent: AiAgent): HandoffTarget[] {
    const targets: HandoffTarget[] = (agent.handoffTargets ?? [])
      .filter((t) => t?.to)
      .map((t) => ({ channel: t.channel, to: t.to, accountId: t.accountId }));
    for (const number of (agent.handoffNumbers ?? []).filter(Boolean)) {
      if (!targets.some((t) => t.channel === 'whatsapp' && t.to === number))
        targets.push({ channel: 'whatsapp', to: number });
    }
    return targets;
  }

  /** Una cuenta elegida a mano solo vale si es de la empresa del chat. */
  private own<T extends { tenantId: unknown }>(
    account: T | null,
    conv: Conversation,
  ): T | null {
    return account && String(account.tenantId) === String(conv.tenantId)
      ? account
      : null;
  }

  /**
   * Cuenta de WhatsApp desde la que sale el aviso: la del destinatario, la que
   * fijó el agente, la de la propia conversación (si es de WhatsApp) o la
   * predeterminada del tenant.
   */
  private async resolveWaConfig(
    conv: Conversation,
    agent: AiAgent,
    target: HandoffTarget,
  ): Promise<WaConfig | null> {
    const chosen = target.accountId ?? agent.handoffAccountId;
    const account =
      (chosen
        ? this.own(await this.waAccounts.findById(String(chosen)), conv)
        : null) ??
      (conv.channel === 'whatsapp'
        ? await this.waAccounts.findById(String(conv.accountId))
        : null) ??
      (await this.waAccounts.getDefault(String(conv.tenantId)));
    if (!account) return null;
    return this.waAccounts.toConfig(account);
  }

  /**
   * Buzón desde el que sale el aviso: el del destinatario, el de la propia
   * conversación (si es de correo) o el predeterminado de la empresa. Sin
   * ninguno, el aviso sale con el remitente de la plataforma.
   */
  private async resolveEmailAccount(
    conv: Conversation,
    target: HandoffTarget,
  ): Promise<EmailAccount | null> {
    const chosen = target.accountId
      ? this.own(await this.emailAccounts.findById(target.accountId), conv)
      : null;
    if (chosen?.active) return chosen;
    if (conv.channel === 'email') {
      const own = await this.emailAccounts.findById(String(conv.accountId));
      if (own?.active) return own;
    }
    const all = (
      await this.emailAccounts.findAll(String(conv.tenantId))
    ).filter((a) => a.active);
    const fallback = all.find((a) => a.isDefault) ?? all[0];
    // `findAll` no trae las credenciales: se vuelve a leer la cuenta entera.
    return fallback ? this.emailAccounts.findById(String(fallback._id)) : null;
  }

  private who(conv: Conversation): string {
    const name = conv.contactName?.trim() || 'Cliente';
    const from =
      conv.channel === 'whatsapp'
        ? `+${conv.contact}`
        : `${CHANNEL_LABELS[conv.channel] ?? conv.channel} · ${conv.contact}`;
    return `${name} (${from})`;
  }

  /**
   * Texto del aviso que recibe el agente humano. `plain` quita el formato de
   * WhatsApp para el correo.
   */
  buildNotice(
    conv: Conversation,
    reason: string | undefined,
    lastMessage: string,
    plain = false,
  ): string {
    const b = (label: string) => (plain ? label : `*${label}*`);
    const link = this.conversationLink(conv);
    return [
      plain
        ? 'Un chat necesita atención humana'
        : '🔔 *Un chat necesita atención humana*',
      '',
      `${b('Cliente:')} ${this.who(conv)}`,
      reason ? `${b('Motivo:')} ${reason}` : null,
      lastMessage
        ? `${b('Último mensaje:')} “${this.trim(lastMessage)}”`
        : null,
      '',
      'El agente IA quedó apagado en esta conversación.',
      link ? `Entra a la plataforma para continuarla:\n${link}` : null,
    ]
      .filter((l) => l !== null)
      .join('\n');
  }

  /** Versión corta para SMS: cliente, motivo y enlace. */
  buildSmsNotice(conv: Conversation, reason: string | undefined): string {
    const link = this.conversationLink(conv);
    return [
      `Un chat necesita atención: ${this.who(conv)}.`,
      reason ? `Motivo: ${this.trim(reason, SMS_REASON_MAX)}.` : null,
      link || null,
    ]
      .filter((l) => l !== null)
      .join(' ');
  }

  private trim(text: string, max = LAST_MESSAGE_MAX): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > max ? `${clean.slice(0, max)}…` : clean;
  }

  private async sendWhatsApp(
    conv: Conversation,
    agent: AiAgent,
    target: HandoffTarget,
    reason: string | undefined,
    lastMessage: string,
  ): Promise<void> {
    const config = await this.resolveWaConfig(conv, agent, target);
    if (!config)
      throw new Error(
        'No hay una cuenta de WhatsApp disponible para enviar el aviso',
      );
    if (config.provider === 'cloudapi' && agent.handoffTemplateName) {
      // Fuera de la ventana de 24 h Meta solo acepta plantillas aprobadas.
      await this.wa.sendCloudApiTemplate(
        target.to,
        agent.handoffTemplateName,
        agent.handoffTemplateLang || 'es',
        [
          conv.contactName?.trim() || `+${conv.contact}`,
          reason || 'El cliente pidió hablar con una persona',
          this.conversationLink(conv) || 'la plataforma',
        ],
        config,
      );
      return;
    }
    await this.wa.sendMessage(
      target.to,
      this.buildNotice(conv, reason, lastMessage),
      config,
    );
  }

  private async sendEmail(
    conv: Conversation,
    target: HandoffTarget,
    reason: string | undefined,
    lastMessage: string,
  ): Promise<void> {
    const subject = `Un chat necesita atención: ${conv.contactName?.trim() || conv.contact}`;
    const text = this.buildNotice(conv, reason, lastMessage, true);
    const html = textToHtml(text);
    // Si el destinatario es un buzón conectado a la plataforma, esta cabecera
    // evita que el aviso se trate como un correo de cliente.
    const headers = { 'Auto-Submitted': 'auto-generated' };
    const account = await this.resolveEmailAccount(conv, target);
    if (!account) {
      await this.mail.sendHtml({ to: target.to, subject, html, text, headers });
      return;
    }
    await this.emailTransport.send(
      await this.emailAccounts.smtpConfig(account),
      {
        from: this.emailAccounts.fromHeader(account),
        to: target.to,
        subject,
        text,
        html,
        headers,
      },
    );
  }

  private async sendSms(
    conv: Conversation,
    target: HandoffTarget,
    reason: string | undefined,
  ): Promise<void> {
    const cfg = await this.sms.requireConfig(String(conv.tenantId));
    await this.sms.dispatch(
      cfg,
      `+${target.to}`,
      this.buildSmsNotice(conv, reason),
    );
  }

  /**
   * Envía el aviso a cada destinatario por su canal. Devuelve a quiénes se les
   * avisó: si uno falla, se sigue con los demás (nunca bloquea la derivación).
   */
  async notify(
    conv: Conversation,
    agent: AiAgent,
    reason: string | undefined,
    lastMessage: string,
  ): Promise<HandoffNotifyResult> {
    const targets = this.targets(agent);
    if (targets.length === 0)
      return {
        notified: [],
        error: 'El agente no tiene destinatarios de aviso configurados',
      };

    const notified: string[] = [];
    const errors: string[] = [];

    for (const target of targets) {
      const label = handoffTargetLabel(target);
      try {
        if (target.channel === 'email')
          await this.sendEmail(conv, target, reason, lastMessage);
        else if (target.channel === 'sms')
          await this.sendSms(conv, target, reason);
        else await this.sendWhatsApp(conv, agent, target, reason, lastMessage);
        notified.push(label);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        errors.push(`${label}: ${detail}`);
        this.logger.error(`No se pudo avisar por ${label}: ${detail}`);
      }
    }

    return { notified, error: errors.length ? errors.join(' | ') : undefined };
  }
}
