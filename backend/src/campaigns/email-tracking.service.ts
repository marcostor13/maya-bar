import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Model, Types } from 'mongoose';
import { CampaignRecipient } from './campaign-recipient.schema';
import { Campaign } from './campaign.schema';
import { ContactActivity } from '../customers/contact-activity.schema';
import { SuppressionService } from '../suppression/suppression.service';
import { emitAutomation } from '../automations/automation-bus';

/** Evento ya procesado (por `svix-id`): Resend reintenta y no se cuenta dos veces. */
@Schema({ collection: 'email_events' })
export class EmailEvent extends Document {
  @Prop({ required: true, unique: true })
  eventId: string;

  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  type: string;

  @Prop({ type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 })
  createdAt: Date;
}
export const EmailEventSchema = SchemaFactory.createForClass(EmailEvent);

/** Cuerpo de un webhook de Resend. */
export interface ResendEvent {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    click?: { link?: string; timestamp?: string };
    bounce?: { type?: string; subType?: string; message?: string };
  };
}

export interface CampaignEmailMetrics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
  rates: { open: number; click: number; bounce: number; unsubscribe: number };
  clickers: {
    _id: string;
    customerId: string;
    name: string;
    to: string;
    clicks: number;
    clickedAt?: Date;
    lastClickUrl?: string;
  }[];
}

const MAX_URLS = 20;
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

/**
 * Aperturas, clics, rebotes y quejas de los emails de campaña (HU61), a partir
 * de los webhooks de Resend de cada empresa.
 */
@Injectable()
export class EmailTrackingService {
  private readonly logger = new Logger(EmailTrackingService.name);

  constructor(
    @InjectModel(CampaignRecipient.name)
    private recipients: Model<CampaignRecipient>,
    @InjectModel(Campaign.name) private campaigns: Model<Campaign>,
    @InjectModel(EmailEvent.name) private events: Model<EmailEvent>,
    @InjectModel(ContactActivity.name)
    private activities: Model<ContactActivity>,
    private suppression: SuppressionService,
  ) {}

  /** Aplica un evento ya verificado. Devuelve qué hizo (para pruebas y registro). */
  async handle(
    tenantId: string,
    eventId: string,
    e: ResendEvent,
  ): Promise<string> {
    const type = e.type ?? '';
    if (!type.startsWith('email.')) return 'ignored';
    const tid = new Types.ObjectId(tenantId);
    try {
      await this.events.create({ eventId, tenantId: tid, type });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return 'duplicate';
      throw err;
    }
    const at = e.created_at ? new Date(e.created_at) : new Date();
    const when = isNaN(at.getTime()) ? new Date() : at;
    const emailId = e.data?.email_id;
    const to = (Array.isArray(e.data?.to) ? e.data?.to[0] : e.data?.to)
      ?.toLowerCase()
      .trim();
    const r = emailId
      ? await this.recipients
          .findOne({ tenantId: tid, providerId: emailId })
          .exec()
      : null;

    switch (type) {
      case 'email.delivered':
        if (r && !r.deliveredAt)
          await this.recipients
            .updateOne({ _id: r._id }, { $set: { deliveredAt: when } })
            .exec();
        return r ? 'delivered' : 'unknown';
      case 'email.opened': {
        if (!r) return 'unknown';
        const first = await this.recipients
          .findOneAndUpdate(
            { _id: r._id, openedAt: { $exists: false } },
            { $set: { openedAt: when }, $inc: { opens: 1 } },
          )
          .exec();
        if (!first) {
          await this.recipients
            .updateOne({ _id: r._id }, { $inc: { opens: 1 } })
            .exec();
          return 'opened';
        }
        const name = await this.campaignName(r.campaignId);
        await this.log(r, 'email_open', `Abrió el email "${name}"`, when);
        emitAutomation({
          type: 'email_opened',
          tenantId,
          customerId: String(r.customerId),
          campaignId: String(r.campaignId),
        });
        return 'opened';
      }
      case 'email.clicked': {
        if (!r) return 'unknown';
        const url = (e.data?.click?.link ?? '').slice(0, 2000);
        const isNewUrl = !!url && !(r.clickedUrls ?? []).includes(url);
        await this.recipients
          .updateOne(
            { _id: r._id },
            {
              $inc: { clicks: 1 },
              $set: {
                lastClickUrl: url || r.lastClickUrl,
                ...(r.clickedAt ? {} : { clickedAt: when }),
                ...(r.openedAt ? {} : { openedAt: when }),
              },
              ...(isNewUrl && (r.clickedUrls?.length ?? 0) < MAX_URLS
                ? { $addToSet: { clickedUrls: url } }
                : {}),
            },
          )
          .exec();
        if (isNewUrl) {
          const name = await this.campaignName(r.campaignId);
          await this.log(
            r,
            'email_click',
            `Hizo clic en el email "${name}"`,
            when,
            url,
          );
          emitAutomation({
            type: 'email_clicked',
            tenantId,
            customerId: String(r.customerId),
            campaignId: String(r.campaignId),
            url,
          });
        }
        return 'clicked';
      }
      case 'email.bounced': {
        const hard = (e.data?.bounce?.type ?? '').toLowerCase() === 'permanent';
        if (r)
          await this.recipients
            .updateOne(
              { _id: r._id },
              { $set: { bouncedAt: when, bounceType: hard ? 'hard' : 'soft' } },
            )
            .exec();
        const email = r?.to || to;
        if (hard && email) {
          await this.suppression.add(tenantId, {
            email,
            name: r?.name,
            reason:
              `Rebote duro: ${e.data?.bounce?.message ?? 'la dirección no existe'}`.slice(
                0,
                300,
              ),
            source: 'bounce',
          });
          return 'bounced_suppressed';
        }
        return 'bounced';
      }
      case 'email.complained': {
        if (r)
          await this.recipients
            .updateOne({ _id: r._id }, { $set: { complainedAt: when } })
            .exec();
        const email = r?.to || to;
        if (email)
          await this.suppression.add(tenantId, {
            email,
            name: r?.name,
            reason: 'Marcó el email como spam',
            source: 'complaint',
          });
        return 'complained';
      }
      default:
        return 'ignored';
    }
  }

  /** Marca la baja en el último email de campaña que recibió esa dirección. */
  async markUnsubscribed(tenantId: string, to: string): Promise<void> {
    await this.recipients
      .findOneAndUpdate(
        {
          tenantId: new Types.ObjectId(tenantId),
          to,
          status: 'sent',
          unsubscribedAt: { $exists: false },
        },
        { $set: { unsubscribedAt: new Date() } },
        { sort: { sentAt: -1 } },
      )
      .exec();
  }

  async metrics(tenantId: string, id: string): Promise<CampaignEmailMetrics> {
    const campaign = Types.ObjectId.isValid(id)
      ? await this.campaigns
          .findOne({
            _id: new Types.ObjectId(id),
            tenantId: new Types.ObjectId(tenantId),
          })
          .select('_id')
          .lean()
          .exec()
      : null;
    if (!campaign) throw new NotFoundException('Campaña no encontrada');
    const campaignId = campaign._id;
    const [agg] = await this.recipients
      .aggregate<Omit<CampaignEmailMetrics, 'rates' | 'clickers'>>([
        { $match: { campaignId, status: 'sent' } },
        {
          $group: {
            _id: null,
            sent: { $sum: 1 },
            delivered: {
              $sum: { $cond: [{ $ifNull: ['$deliveredAt', false] }, 1, 0] },
            },
            opened: {
              $sum: { $cond: [{ $ifNull: ['$openedAt', false] }, 1, 0] },
            },
            clicked: {
              $sum: { $cond: [{ $ifNull: ['$clickedAt', false] }, 1, 0] },
            },
            bounced: {
              $sum: { $cond: [{ $ifNull: ['$bouncedAt', false] }, 1, 0] },
            },
            complained: {
              $sum: { $cond: [{ $ifNull: ['$complainedAt', false] }, 1, 0] },
            },
            unsubscribed: {
              $sum: { $cond: [{ $ifNull: ['$unsubscribedAt', false] }, 1, 0] },
            },
          },
        },
      ])
      .exec();
    const m = agg ?? {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      complained: 0,
      unsubscribed: 0,
    };
    const clickers = await this.recipients
      .find(
        { campaignId, clickedAt: { $exists: true } },
        {
          customerId: 1,
          name: 1,
          to: 1,
          clicks: 1,
          clickedAt: 1,
          lastClickUrl: 1,
        },
      )
      .sort({ clickedAt: -1 })
      .limit(200)
      .lean()
      .exec();
    return {
      sent: m.sent,
      delivered: m.delivered,
      opened: m.opened,
      clicked: m.clicked,
      bounced: m.bounced,
      complained: m.complained,
      unsubscribed: m.unsubscribed,
      rates: {
        open: pct(m.opened, m.sent),
        click: pct(m.clicked, m.sent),
        bounce: pct(m.bounced, m.sent),
        unsubscribe: pct(m.unsubscribed, m.sent),
      },
      clickers: clickers.map((c) => ({
        _id: String(c._id),
        customerId: String(c.customerId),
        name: c.name,
        to: c.to,
        clicks: c.clicks ?? 0,
        clickedAt: c.clickedAt,
        lastClickUrl: c.lastClickUrl,
      })),
    };
  }

  private async campaignName(id: Types.ObjectId) {
    const c = await this.campaigns.findById(id).select('name').lean().exec();
    return c?.name ?? 'campaña';
  }

  private async log(
    r: CampaignRecipient,
    type: 'email_open' | 'email_click',
    title: string,
    at: Date,
    body?: string,
  ) {
    try {
      await this.activities.create({
        tenantId: r.tenantId,
        customerId: r.customerId,
        type,
        title: title.slice(0, 200),
        body,
        at,
      });
    } catch (err) {
      this.logger.warn(`No se registró la actividad de email: ${String(err)}`);
    }
  }
}
