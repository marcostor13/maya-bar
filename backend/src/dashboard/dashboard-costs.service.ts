import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { resolveRange, safeTimezone } from './analytics.helpers';
import { WA_RATES_EFFECTIVE } from './message-pricing';
import { smsSegments } from '../sms/sms-segments';

export interface CostSettings {
  smsPerSegment?: number;
  emailPer1000?: number;
}

export interface MessageCosts {
  range: string;
  from: Date;
  to: Date;
  currency: 'USD';
  ratesEffective: string;
  totalUsd: number;
  whatsapp: {
    usd: number;
    billed: number;
    free: number;
    /** Enviados sin dato de cobro de Meta (aún sin estado o anteriores a HU18). */
    unknown: number;
    byCategory: { category: string; count: number; usd: number }[];
  };
  sms: {
    segments: number;
    messages: number;
    ratePerSegment: number | null;
    usd: number | null;
  };
  email: { sent: number; ratePer1000: number | null; usd: number | null };
  instagram: { sent: number; usd: 0 };
  messenger: { sent: number; usd: 0 };
  settings: CostSettings;
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;

/** Costos estimados de los mensajes enviados (HU18). */
@Injectable()
export class DashboardCostsService {
  constructor(@InjectConnection() private conn: Connection) {}

  private model(name: string): Model<any> | null {
    return (this.conn.models[name] as Model<any> | undefined) ?? null;
  }

  async settings(tenantId: string): Promise<CostSettings> {
    const t = await this.model('Tenant')
      ?.findById(tenantId)
      .select('messageCosts')
      .lean<{ messageCosts?: CostSettings }>()
      .exec();
    return {
      smsPerSegment: t?.messageCosts?.smsPerSegment,
      emailPer1000: t?.messageCosts?.emailPer1000,
    };
  }

  /** Solo cambia los campos presentes: `null` quita la tarifa, ausente la conserva. */
  async saveSettings(
    tenantId: string,
    s: { smsPerSegment?: number | null; emailPer1000?: number | null },
  ): Promise<CostSettings> {
    const set: Record<string, number> = {};
    const unset: Record<string, 1> = {};
    for (const key of ['smsPerSegment', 'emailPer1000'] as const) {
      if (!(key in s) || s[key] === undefined) continue;
      const v = s[key];
      if (v === null) unset[`messageCosts.${key}`] = 1;
      else set[`messageCosts.${key}`] = v;
    }
    await this.model('Tenant')
      ?.updateOne(
        { _id: new Types.ObjectId(tenantId) },
        {
          ...(Object.keys(set).length ? { $set: set } : {}),
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
        },
      )
      .exec();
    return this.settings(tenantId);
  }

  async costs(
    tenantId: string,
    rangeKey?: string,
    tz?: string,
  ): Promise<MessageCosts> {
    const range = resolveRange(rangeKey, safeTimezone(tz));
    const tid = new Types.ObjectId(tenantId);
    const tenantMatch = { $in: [tid, tenantId] };
    const period = { $gte: range.from, $lt: range.to };
    const settings = await this.settings(tenantId);

    const [byChannel, waCats, campaignSends, apiSms] = await Promise.all([
      this.outByChannel(tenantMatch, period),
      this.whatsappByCategory(tenantMatch, period),
      this.campaignSends(tenantMatch, period),
      this.apiSms(tenantMatch, period),
    ]);

    const billed = waCats.filter((c) => c.type === 'regular');
    const byCategory = new Map<string, { count: number; usd: number }>();
    for (const c of billed) {
      const cur = byCategory.get(c.category) ?? { count: 0, usd: 0 };
      cur.count += c.count;
      cur.usd += c.usd;
      byCategory.set(c.category, cur);
    }
    const waUsd = round(billed.reduce((a, c) => a + c.usd, 0));
    const pricedCount = waCats.reduce((a, c) => a + c.count, 0);
    const waOut = byChannel.whatsapp ?? 0;

    const smsSegmentsTotal = campaignSends.smsSegments + apiSms.segments;
    const smsMessages = campaignSends.smsMessages + apiSms.messages;
    const smsRate = settings.smsPerSegment ?? null;
    const smsUsd = smsRate === null ? null : round(smsSegmentsTotal * smsRate);

    const emailSent = (byChannel.email ?? 0) + campaignSends.emails;
    const emailRate = settings.emailPer1000 ?? null;
    const emailUsd =
      emailRate === null ? null : round((emailSent / 1000) * emailRate);

    return {
      range: range.key,
      from: range.from,
      to: range.to,
      currency: 'USD',
      ratesEffective: WA_RATES_EFFECTIVE,
      totalUsd: round(waUsd + (smsUsd ?? 0) + (emailUsd ?? 0)),
      whatsapp: {
        usd: waUsd,
        billed: billed.reduce((a, c) => a + c.count, 0),
        free: pricedCount - billed.reduce((a, c) => a + c.count, 0),
        unknown: Math.max(0, waOut - pricedCount),
        byCategory: [...byCategory.entries()]
          .map(([category, v]) => ({
            category,
            count: v.count,
            usd: round(v.usd),
          }))
          .sort((a, b) => b.usd - a.usd),
      },
      sms: {
        segments: smsSegmentsTotal,
        messages: smsMessages,
        ratePerSegment: smsRate,
        usd: smsUsd,
      },
      email: { sent: emailSent, ratePer1000: emailRate, usd: emailUsd },
      instagram: { sent: byChannel.instagram ?? 0, usd: 0 },
      messenger: { sent: byChannel.messenger ?? 0, usd: 0 },
      settings,
    };
  }

  /** Mensajes salientes entregados al proveedor, por canal de la conversación. */
  private async outByChannel(
    tenantMatch: unknown,
    period: unknown,
  ): Promise<Record<string, number>> {
    const msgs = this.model('Message');
    const convs = this.model('Conversation');
    if (!msgs || !convs) return {};
    const rows = await msgs
      .aggregate<{ _id: string; n: number }>([
        {
          $match: {
            tenantId: tenantMatch,
            direction: 'out',
            at: period,
            status: { $in: ['sent', 'delivered', 'read'] },
          },
        },
        { $group: { _id: '$conversationId', n: { $sum: 1 } } },
        {
          $lookup: {
            from: convs.collection.collectionName,
            localField: '_id',
            foreignField: '_id',
            as: 'c',
            pipeline: [{ $project: { channel: 1 } }],
          },
        },
        { $unwind: '$c' },
        { $group: { _id: '$c.channel', n: { $sum: '$n' } } },
      ])
      .exec();
    return Object.fromEntries(rows.map((r) => [r._id, r.n]));
  }

  private async whatsappByCategory(tenantMatch: unknown, period: unknown) {
    const msgs = this.model('Message');
    if (!msgs) return [];
    const rows = await msgs
      .aggregate<{
        _id: { category: string; type: string };
        count: number;
        usd: number;
      }>([
        {
          $match: {
            tenantId: tenantMatch,
            direction: 'out',
            at: period,
            'pricing.category': { $exists: true },
            status: { $ne: 'failed' },
          },
        },
        {
          $group: {
            _id: { category: '$pricing.category', type: '$pricing.type' },
            count: { $sum: 1 },
            usd: { $sum: { $ifNull: ['$pricing.usd', 0] } },
          },
        },
      ])
      .exec();
    return rows.map((r) => ({
      category: r._id.category,
      type: r._id.type,
      count: r.count,
      usd: r.usd,
    }));
  }

  /** SMS y correos de campañas (WhatsApp ya cuenta por sus mensajes). */
  private async campaignSends(tenantMatch: unknown, period: unknown) {
    const recipients = this.model('CampaignRecipient');
    const campaigns = this.model('Campaign');
    const out = { smsSegments: 0, smsMessages: 0, emails: 0 };
    if (!recipients || !campaigns) return out;
    const rows = await recipients
      .aggregate<{
        _id: unknown;
        n: number;
      }>([
        { $match: { tenantId: tenantMatch, status: 'sent', sentAt: period } },
        { $group: { _id: '$campaignId', n: { $sum: 1 } } },
      ])
      .exec();
    if (!rows.length) return out;
    const list = await campaigns
      .find({ _id: { $in: rows.map((r) => r._id) } })
      .select('type body')
      .lean<{ _id: unknown; type: string; body?: string }[]>()
      .exec();
    const byId = new Map(list.map((c) => [String(c._id), c]));
    for (const r of rows) {
      const c = byId.get(String(r._id));
      if (!c) continue;
      if (c.type === 'email') out.emails += r.n;
      if (c.type === 'sms') {
        // Estimado con el texto base: las variables cambian poco la longitud.
        out.smsMessages += r.n;
        out.smsSegments += r.n * smsSegments(c.body ?? '');
      }
    }
    return out;
  }

  private async apiSms(tenantMatch: unknown, period: unknown) {
    const model = this.model('ApiSmsMessage');
    if (!model) return { segments: 0, messages: 0 };
    const [row] = await model
      .aggregate<{ segments: number; messages: number }>([
        { $match: { tenantId: tenantMatch, status: 'sent', at: period } },
        {
          $group: {
            _id: null,
            segments: { $sum: { $ifNull: ['$segments', 1] } },
            messages: { $sum: 1 },
          },
        },
      ])
      .exec();
    return { segments: row?.segments ?? 0, messages: row?.messages ?? 0 };
  }
}
