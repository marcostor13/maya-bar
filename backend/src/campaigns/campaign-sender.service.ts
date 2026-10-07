import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Campaign, CampaignStats } from './campaign.schema';
import { CampaignRecipient } from './campaign-recipient.schema';
import { Customer } from '../customers/customer.schema';
import { Tenant } from '../tenants/tenant.schema';
import { MailService } from '../mail/mail.service';
import { EmailAccountsService } from '../email-accounts/email-accounts.service';
import { EmailTransportService } from '../email-accounts/email-transport.service';
import { SmsService } from '../sms/sms.service';
import { ResendService, TenantMailer } from '../resend/resend.service';
import { SmsConfig } from '../sms/sms-config.schema';
import {
  SuppressionService,
  SuppressionSet,
} from '../suppression/suppression.service';
import {
  TokenContext,
  TokenSource,
  fillTokensHtml,
  fillTokensMultiline,
  usesToken,
} from '../shared/contact-tokens';

/** Mientras se procesa un lote nadie más puede tomar la campaña. */
const LOCK_MS = 5 * 60 * 1000;
/** Correos por pasada (una pasada por minuto). */
const EMAIL_BATCH = 60;
/** Tope de SMS por pasada aunque el proveedor admita más. */
const SMS_BATCH_MAX = 120;
const CONCURRENCY = 5;
/** Resend limita las peticiones por segundo: con su cuenta se va de dos en dos. */
const RESEND_CONCURRENCY = 2;
const MAX_ATTEMPTS = 2;
/** Errores que merecen un segundo intento en la pasada siguiente. */
const TRANSIENT_RE =
  /timeout|a tiempo|ECONN|ENOTFOUND|EAI_AGAIN|socket|respondió (429|5\d\d)|rate limit|too many/i;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Versión en texto de un HTML, para la parte `text/plain` del correo. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Email de solo texto: un HTML sobrio que respeta los saltos de línea. */
export function plainEmailHtml(text: string): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:24px 12px;background:#f3f4f6;"><div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1f2937;white-space:pre-wrap;">${escapeHtml(text)}</div></body></html>`;
}

/** Añade el pie de baja si el diseño no trae ya su propio enlace. */
export function withUnsubscribeFooter(
  html: string,
  hasOwnLink: boolean,
): string {
  if (hasOwnLink) return html;
  const footer =
    '<div style="max-width:600px;margin:0 auto;padding:16px 12px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b7280;">Si no quieres recibir más correos, <a href="{baja}" style="color:#6b7280;">date de baja aquí</a>.</div>';
  return /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${footer}</body>`)
    : html + footer;
}

/**
 * Envío en segundo plano de campañas de email y SMS. Una pasada por minuto
 * toma cada campaña en curso con un candado atómico, despacha un lote de
 * destinatarios pendientes y actualiza el estado de cada uno. No hay nada en
 * memoria: tras un reinicio, la siguiente pasada continúa donde se quedó.
 */
@Injectable()
export class CampaignSenderService {
  private readonly logger = new Logger(CampaignSenderService.name);
  private readonly apiBase: string;
  private readonly secret: string;
  private running = false;

  constructor(
    @InjectModel(Campaign.name) private campaignModel: Model<Campaign>,
    @InjectModel(CampaignRecipient.name)
    private recipientModel: Model<CampaignRecipient>,
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
    @InjectModel(Tenant.name) private tenantModel: Model<Tenant>,
    private mail: MailService,
    private emailAccounts: EmailAccountsService,
    private transport: EmailTransportService,
    private sms: SmsService,
    private resend: ResendService,
    private suppression: SuppressionService,
    config: ConfigService,
  ) {
    this.apiBase = (config.get<string>('PUBLIC_API_URL') ?? '').replace(
      /\/+$/,
      '',
    );
    this.secret = config.getOrThrow<string>('JWT_SECRET');
  }

  // ------------------------------------------------------------------
  // Link de baja
  // ------------------------------------------------------------------

  /**
   * Token del link de baja: empresa y dirección, firmados. No apunta al
   * registro del destinatario a propósito: esos registros se borran al
   * reenviar o eliminar la campaña, y el enlace de un correo ya entregado
   * tiene que seguir funcionando.
   */
  unsubscribeToken(tenantId: string, to: string): string {
    const payload = Buffer.from(`${tenantId}|${to}`, 'utf8').toString(
      'base64url',
    );
    return `${payload}.${this.sign(payload)}`;
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret)
      .update(`unsub:${payload}`)
      .digest('hex')
      .slice(0, 24);
  }

  /** Empresa y dirección del token si es auténtico; `null` si no. */
  verifyUnsubscribeToken(
    token: string,
  ): { tenantId: string; to: string } | null {
    const [payload, sig] = (token ?? '').split('.');
    if (!payload || !sig) return null;
    const a = Buffer.from(sig);
    const b = Buffer.from(this.sign(payload));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    const cut = decoded.indexOf('|');
    const tenantId = decoded.slice(0, cut);
    const to = decoded.slice(cut + 1);
    if (cut < 0 || !Types.ObjectId.isValid(tenantId) || !to) return null;
    return { tenantId, to };
  }

  unsubscribeUrl(tenantId: string, to: string): string {
    return `${this.apiBase}/u/${this.unsubscribeToken(tenantId, to)}`;
  }

  /** Da de baja la dirección del token en su empresa. Idempotente. */
  async unsubscribe(token: string): Promise<boolean> {
    const target = this.verifyUnsubscribeToken(token);
    if (!target) return false;
    await this.suppression.add(target.tenantId, {
      ...(target.to.includes('@')
        ? { email: target.to }
        : { phone: target.to }),
      reason: 'Se dio de baja desde el enlace de una campaña',
      source: 'reply',
    });
    return true;
  }

  // ------------------------------------------------------------------
  // Worker
  // ------------------------------------------------------------------

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    // Una pasada larga no debe solaparse con la siguiente en el mismo proceso.
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      await this.campaignModel
        .updateMany(
          {
            status: 'scheduled',
            type: { $in: ['email', 'sms'] },
            scheduledAt: { $lte: now },
          },
          { $set: { status: 'sending', startedAt: now } },
        )
        .exec();

      const due = await this.campaignModel
        .find(
          { status: 'sending', type: { $in: ['email', 'sms'] } },
          { _id: 1 },
        )
        .lean()
        .exec();
      for (const { _id } of due) await this.runOne(_id);
    } catch (err) {
      this.logger.error(`Pasada de campañas falló: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }

  private async runOne(id: Types.ObjectId): Promise<void> {
    const now = new Date();
    // Candado atómico: si otra instancia ya tomó la campaña, se salta.
    const campaign = await this.campaignModel
      .findOneAndUpdate(
        {
          _id: id,
          status: 'sending',
          $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }],
        },
        { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) } },
        { new: true },
      )
      .exec();
    if (!campaign) return;
    try {
      await this.processBatch(campaign);
    } catch (err) {
      this.logger.error(
        `Campaña ${String(id)}: el lote falló: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      await this.campaignModel
        .updateOne({ _id: id }, { $unset: { lockedUntil: 1 } })
        .exec();
    }
  }

  /** Despacha un lote de pendientes y cierra la campaña si ya no queda nada. */
  async processBatch(campaign: Campaign): Promise<void> {
    const tenantId = String(campaign.tenantId);
    let smsConfig: SmsConfig | null = null;
    let limit = EMAIL_BATCH;

    if (campaign.type === 'sms') {
      try {
        smsConfig = await this.sms.requireConfig(tenantId);
      } catch (err) {
        // Sin proveedor no tiene sentido reintentar cada minuto para siempre.
        await this.failCampaign(
          campaign,
          err instanceof Error ? err.message : String(err),
        );
        return;
      }
      limit = Math.min(smsConfig.ratePerMinute || 60, SMS_BATCH_MAX);
    }

    const sender = await this.resolveSender(campaign);
    // Con la cuenta de Resend de la empresa el ritmo lo marca su propio límite:
    // dos envíos a la vez, espaciados para no pasar de sus envíos por minuto.
    let concurrency = CONCURRENCY;
    let minChunkMs = 0;
    if (sender.kind === 'resend') {
      const rate = Math.min(Math.max(sender.mailer.ratePerMinute, 10), 600);
      limit = rate;
      concurrency = RESEND_CONCURRENCY;
      minChunkMs = Math.ceil((RESEND_CONCURRENCY * 60_000) / rate);
    }

    const batch = await this.recipientModel
      .find({ campaignId: campaign._id, status: 'pending' })
      .sort({ _id: 1 })
      .limit(limit)
      .exec();

    if (batch.length) {
      const [suppressed, tenant, customers] = await Promise.all([
        this.suppression.setFor(tenantId),
        this.tenantModel.findById(campaign.tenantId, { name: 1 }).lean().exec(),
        this.customerModel
          .find(
            {
              tenantId: campaign.tenantId,
              _id: { $in: batch.map((r) => r.customerId) },
            },
            { name: 1, email: 1, phone: 1, customFields: 1 },
          )
          .lean()
          .exec(),
      ]);
      const byId = new Map(
        customers.map((c) => [String(c._id), c as TokenSource]),
      );
      const company = tenant?.name ?? '';

      for (let i = 0; i < batch.length; i += concurrency) {
        const startedAt = Date.now();
        await Promise.all(
          batch.slice(i, i + concurrency).map((recipient) =>
            this.sendOne(campaign, recipient, {
              suppressed,
              company,
              contact: byId.get(String(recipient.customerId)),
              sender,
              smsConfig,
            }),
          ),
        );
        const wait = minChunkMs - (Date.now() - startedAt);
        if (wait > 0 && i + concurrency < batch.length)
          await new Promise((r) => setTimeout(r, wait));
      }
    }

    const stats = await this.countStats(campaign._id);
    if (stats.pending > 0) {
      await this.campaignModel
        .updateOne({ _id: campaign._id }, { $set: { stats } })
        .exec();
      return;
    }

    const problems = [
      stats.failed ? `${stats.failed} no se pudieron enviar` : '',
      stats.skipped ? `${stats.skipped} omitidos` : '',
    ].filter(Boolean);
    await this.campaignModel
      .updateOne(
        { _id: campaign._id },
        {
          $set: {
            stats,
            // Solo es un fallo si no salió ninguno y hubo errores de envío.
            status: stats.sent === 0 && stats.failed > 0 ? 'failed' : 'sent',
            sentAt: new Date(),
            recipientCount: stats.sent,
            errorMessage: problems.length ? problems.join(' · ') : undefined,
          },
        },
      )
      .exec();
  }

  private async sendOne(
    campaign: Campaign,
    recipient: CampaignRecipient,
    env: {
      suppressed: SuppressionSet;
      company: string;
      contact?: TokenSource;
      sender: Sender;
      smsConfig: SmsConfig | null;
    },
  ): Promise<void> {
    const isEmail = campaign.type === 'email';
    // Se vuelve a mirar justo antes de enviar: pudo darse de baja con el
    // envío ya en marcha.
    const key = isEmail ? { email: recipient.to } : { phone: recipient.to };
    if (this.suppression.matches(env.suppressed, key)) {
      await this.mark(recipient, 'skipped', 'En la lista de no contactar');
      return;
    }

    const contact: TokenSource = env.contact ?? {
      name: recipient.name,
      ...(isEmail ? { email: recipient.to } : { phone: recipient.to }),
    };
    const ctx: TokenContext = {
      empresa: env.company,
      link: recipient.shortUrl ?? campaign.linkUrl ?? '',
      baja: this.unsubscribeUrl(String(recipient.tenantId), recipient.to),
    };

    try {
      let providerId: string | undefined;
      if (isEmail) {
        providerId = await this.sendEmail(
          campaign,
          recipient,
          contact,
          ctx,
          env,
        );
      } else {
        const result = await this.sms.dispatch(
          env.smsConfig!,
          recipient.to,
          fillTokensMultiline(campaign.body ?? '', contact, ctx),
        );
        providerId = result.id;
      }
      recipient.status = 'sent';
      recipient.sentAt = new Date();
      recipient.providerId = providerId;
      recipient.error = undefined;
      recipient.attempts += 1;
      await recipient.save();
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(
        0,
        400,
      );
      recipient.attempts += 1;
      // Un fallo de un destinatario nunca detiene el lote.
      if (recipient.attempts < MAX_ATTEMPTS && TRANSIENT_RE.test(message)) {
        recipient.error = message;
        await recipient.save();
      } else {
        await this.mark(recipient, 'failed', message);
      }
    }
  }

  private async sendEmail(
    campaign: Campaign,
    recipient: CampaignRecipient,
    contact: TokenSource,
    ctx: TokenContext,
    env: { company: string; sender: Sender },
  ): Promise<string> {
    const source = campaign.html || plainEmailHtml(campaign.body ?? '');
    const html = fillTokensHtml(
      withUnsubscribeFooter(source, usesToken(source, 'baja')),
      contact,
      ctx,
    );
    const text = campaign.body
      ? fillTokensMultiline(campaign.body, contact, ctx)
      : htmlToText(html);
    const subject = fillTokensMultiline(
      campaign.subject || campaign.name,
      contact,
      ctx,
    ).replace(/\s+/g, ' ');
    const headers = {
      'List-Unsubscribe': `<${ctx.baja}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };

    if (env.sender.kind === 'account') {
      return this.transport.send(env.sender.smtp, {
        from: env.sender.from,
        to: recipient.to,
        subject,
        text,
        html,
        headers,
      });
    }
    if (env.sender.kind === 'resend')
      return env.sender.mailer.send({
        to: recipient.to,
        subject,
        html,
        text,
        headers,
      });
    return this.mail.sendHtml({
      to: recipient.to,
      subject,
      html,
      text,
      fromName: env.company || undefined,
      headers,
    });
  }

  /**
   * Por dónde sale la campaña, en este orden: el buzón elegido en la campaña,
   * la cuenta de Resend de la empresa, o el remitente de la plataforma.
   */
  private async resolveSender(campaign: Campaign): Promise<Sender> {
    if (campaign.type !== 'email') return { kind: 'platform' };
    if (!campaign.senderAccountId) return this.defaultSender(campaign);
    const account = await this.emailAccounts.findById(
      String(campaign.senderAccountId),
    );
    if (
      !account ||
      String(account.tenantId) !== String(campaign.tenantId) ||
      !account.active
    ) {
      // Mejor que salga por la plataforma a que la campaña se quede colgada.
      this.logger.warn(
        `Campaña ${String(campaign._id)}: el buzón remitente ya no está disponible; se usa el remitente por defecto`,
      );
      return this.defaultSender(campaign);
    }
    return {
      kind: 'account',
      smtp: await this.emailAccounts.smtpConfig(account),
      from: this.emailAccounts.fromHeader(account),
    };
  }

  private async defaultSender(campaign: Campaign): Promise<Sender> {
    const mailer = await this.resend
      .mailer(String(campaign.tenantId))
      .catch((err) => {
        // Una cuenta de Resend rota no debe dejar la campaña colgada.
        this.logger.warn(
          `Campaña ${String(campaign._id)}: no se pudo usar la cuenta de Resend de la empresa: ${String(err)}`,
        );
        return null;
      });
    return mailer ? { kind: 'resend', mailer } : { kind: 'platform' };
  }

  private async mark(
    recipient: CampaignRecipient,
    status: 'failed' | 'skipped',
    error: string,
  ): Promise<void> {
    recipient.status = status;
    recipient.error = error;
    await recipient.save();
  }

  private async failCampaign(
    campaign: Campaign,
    message: string,
  ): Promise<void> {
    await this.campaignModel
      .updateOne(
        { _id: campaign._id },
        { $set: { status: 'failed', errorMessage: message } },
      )
      .exec();
  }

  async countStats(campaignId: Types.ObjectId): Promise<CampaignStats> {
    const rows = await this.recipientModel
      .aggregate<{
        _id: string;
        n: number;
      }>([
        { $match: { campaignId } },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ])
      .exec();
    const stats: CampaignStats = {
      total: 0,
      pending: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
    };
    for (const r of rows) {
      if (r._id in stats) stats[r._id as keyof CampaignStats] = r.n;
      stats.total += r.n;
    }
    return stats;
  }
}

type Sender =
  | { kind: 'platform' }
  | { kind: 'resend'; mailer: TenantMailer }
  | {
      kind: 'account';
      smtp: Awaited<ReturnType<EmailAccountsService['smtpConfig']>>;
      from: string;
    };
