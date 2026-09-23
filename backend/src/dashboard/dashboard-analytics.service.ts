import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type PipelineStage } from 'mongoose';
import { Customer } from '../customers/customer.schema';
import {
  Conversation,
  type ConversationChannel,
} from '../conversations/conversation.schema';
import { Message } from '../conversations/message.schema';
import { AiAgent } from '../ai-agents/ai-agent.schema';
import { Lead } from '../leads/lead.schema';
import { LEAD_STAGES } from '../leads/lead-stages.catalog';
import { Campaign } from '../campaigns/campaign.schema';
import { FormSubmission } from '../forms/form-submission.schema';
import { ContactForm } from '../forms/form.schema';
import { EventRegistration } from '../events/event-registration.schema';
import { RecoveryPlan } from '../recovery/recovery-plan.schema';
import { Prospect } from '../prospecting/prospect.schema';
import { SuppressionEntry } from '../suppression/suppression-entry.schema';
import { isOwnerScoped } from '../auth/permissions';
import {
  bucketFormat,
  deltaPct,
  fillSeries,
  resolveRange,
  responseStats,
  safeTimezone,
  type ResolvedRange,
  type ResponseSample,
  type ResponseStats,
} from './analytics.helpers';

export const CHANNEL_FILTERS = [
  'whatsapp',
  'instagram',
  'messenger',
  'email',
] as const;

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  messenger: 'Messenger',
  email: 'Correo',
  form: 'Formulario',
  event: 'Evento',
  reservation: 'Reserva',
  manual: 'Alta manual',
  import: 'Importación',
  mongodb: 'Importación externa',
  api: 'API',
  prospecting: 'Prospección',
};

/** Tope de mensajes que se leen para medir tiempos de respuesta. */
const RESPONSE_SAMPLE_LIMIT = 40_000;

export interface Kpi {
  value: number;
  previous: number;
  delta: number | null;
  /** Un valor por cubeta del periodo, para el sparkline. */
  series: number[];
}

export interface Breakdown {
  key: string;
  label: string;
  count: number;
  value?: number;
}

export interface DashboardAnalytics {
  range: {
    key: string;
    from: string;
    to: string;
    bucket: 'day' | 'month';
    buckets: string[];
    timezone: string;
  };
  channel: string | null;
  kpis: {
    wonValue: Kpi;
    wonDeals: Kpi;
    newContacts: Kpi;
    newConversations: Kpi;
    inbound: Kpi;
    aiShare: Kpi;
    newLeads: Kpi;
    conversionRate: Kpi;
  };
  pipeline: { open: number; openValue: number; weightedValue: number };
  activity: { inbound: number[]; ai: number[]; human: number[] };
  heatmap: number[][];
  response: ResponseStats;
  channels: Breakdown[];
  sources: Breakdown[];
  funnel: (Breakdown & { color: string; probability: number })[];
  outcomes: {
    won: number;
    lost: number;
    /** Perdidas por cubeta, junto a kpis.wonDeals.series. */
    lostSeries: number[];
    lostReasons: Breakdown[];
  };
  agents: {
    id: string;
    name: string;
    replies: number;
    conversations: number;
    handoffs: number;
  }[];
  marketing: {
    campaigns: { sent: number; recipients: number; byType: Breakdown[] };
    recovery: { sent: number; failed: number };
    forms: { submissions: number; top: Breakdown[] };
    events: { registrations: number; attendees: number; checkedIn: number };
    suppression: { added: number };
  };
  prospecting: {
    found: number;
    researched: number;
    withMaterial: number;
    contacted: number;
    converted: number;
  };
  tags: Breakdown[];
  alerts: { overdueTasks: number; unread: number; escalated: number };
}

@Injectable()
export class DashboardAnalyticsService {
  constructor(
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
    @InjectModel(Conversation.name) private convModel: Model<Conversation>,
    @InjectModel(Message.name) private msgModel: Model<Message>,
    @InjectModel(AiAgent.name) private agentModel: Model<AiAgent>,
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
    @InjectModel(Campaign.name) private campaignModel: Model<Campaign>,
    @InjectModel(FormSubmission.name)
    private submissionModel: Model<FormSubmission>,
    @InjectModel(ContactForm.name) private formModel: Model<ContactForm>,
    @InjectModel(EventRegistration.name)
    private registrationModel: Model<EventRegistration>,
    @InjectModel(RecoveryPlan.name) private recoveryModel: Model<RecoveryPlan>,
    @InjectModel(Prospect.name) private prospectModel: Model<Prospect>,
    @InjectModel(SuppressionEntry.name)
    private suppressionModel: Model<SuppressionEntry>,
  ) {}

  async analytics(
    tenantId: string,
    userId: string,
    role: string,
    query: { range?: string; channel?: string; tz?: string },
  ): Promise<DashboardAnalytics> {
    const tid = new Types.ObjectId(tenantId);
    const range = resolveRange(query.range, safeTimezone(query.tz));
    const channel = (CHANNEL_FILTERS as readonly string[]).includes(
      query.channel ?? '',
    )
      ? (query.channel as ConversationChannel)
      : null;

    // Con canal, los mensajes se acotan a las conversaciones de ese canal.
    const convIds = channel
      ? await this.convModel
          .find({ tenantId: tid, channel }, { _id: 1 })
          .lean()
          .exec()
          .then((rows) => rows.map((r) => r._id))
      : null;
    const msgScope = convIds ? { conversationId: { $in: convIds } } : {};
    const leadScope: Record<string, unknown> = { tenantId: tid };
    if (isOwnerScoped(role)) {
      const uid = new Types.ObjectId(userId);
      leadScope.$or = [{ ownerId: uid }, { createdBy: uid }];
    }
    const contactScope = channel ? { source: channel } : {};
    const convScope = channel ? { channel } : {};

    const inRange = { $gte: range.from, $lte: range.to };
    const inPrev = { $gte: range.prevFrom, $lt: range.prevTo };

    const [
      messageRows,
      messagePrev,
      contactSeries,
      contactsPrev,
      convSeries,
      convPrev,
      wonSeries,
      wonPrev,
      leadSeries,
      leadsPrev,
      lostCount,
      lostPrev,
      heatRows,
      samples,
      channelRows,
      sourceRows,
      funnelRows,
      lostReasons,
      agentRows,
      handoffRows,
      campaigns,
      recovery,
      forms,
      events,
      suppressionAdded,
      prospecting,
      tags,
      overdue,
      unread,
      escalated,
    ] = await Promise.all([
      this.messageSeries(tid, range, msgScope),
      this.messageTotals(tid, inPrev, msgScope),
      this.countSeries(
        this.customerModel,
        { tenantId: tid, ...contactScope },
        'createdAt',
        range,
      ),
      this.customerModel.countDocuments({
        tenantId: tid,
        ...contactScope,
        createdAt: inPrev,
      }),
      this.countSeries(
        this.convModel,
        { tenantId: tid, ...convScope },
        'createdAt',
        range,
      ),
      this.convModel.countDocuments({
        tenantId: tid,
        ...convScope,
        createdAt: inPrev,
      }),
      this.wonLostSeries(leadScope, range),
      this.leadModel.aggregate<{ value: number; count: number }>([
        { $match: { ...leadScope, status: 'won', closedAt: inPrev } },
        {
          $group: { _id: null, value: { $sum: '$value' }, count: { $sum: 1 } },
        },
      ]),
      this.countSeries(this.leadModel, leadScope, 'createdAt', range),
      this.leadModel.countDocuments({ ...leadScope, createdAt: inPrev }),
      this.leadModel.countDocuments({
        ...leadScope,
        status: 'lost',
        closedAt: inRange,
      }),
      this.leadModel.countDocuments({
        ...leadScope,
        status: 'lost',
        closedAt: inPrev,
      }),
      this.heatmap(tid, range, msgScope),
      this.msgModel
        .find(
          {
            tenantId: tid,
            at: inRange,
            author: { $ne: 'system' },
            ...msgScope,
          },
          { conversationId: 1, direction: 1, author: 1, at: 1 },
        )
        .sort({ conversationId: 1, at: 1 })
        .limit(RESPONSE_SAMPLE_LIMIT)
        .lean()
        .exec(),
      this.inboundByChannel(tid, range),
      this.customerModel.aggregate<{ _id: string; count: number }>([
        { $match: { tenantId: tid, ...contactScope, createdAt: inRange } },
        { $group: { _id: '$source', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.leadModel.aggregate<{ _id: string; count: number; value: number }>([
        { $match: { ...leadScope, status: 'open' } },
        {
          $group: {
            _id: '$stage',
            count: { $sum: 1 },
            value: { $sum: '$value' },
          },
        },
      ]),
      this.leadModel.aggregate<{ _id: string; count: number }>([
        { $match: { ...leadScope, status: 'lost', closedAt: inRange } },
        {
          $group: {
            _id: { $ifNull: ['$lostReason', 'Sin motivo'] },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
      this.agentReplies(tid, range, msgScope),
      this.convModel.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { tenantId: tid, ...convScope, escalatedAt: inRange } },
        { $group: { _id: '$agentId', count: { $sum: 1 } } },
      ]),
      this.campaignStats(tid, range),
      this.recoveryStats(tid, range),
      this.formStats(tid, range),
      this.eventStats(tid, range),
      this.suppressionModel.countDocuments({
        tenantId: tid,
        createdAt: inRange,
      }),
      this.prospectStats(tid, range),
      this.customerModel.aggregate<{ _id: string; count: number }>([
        {
          $match: {
            tenantId: tid,
            ...contactScope,
            'tags.0': { $exists: true },
          },
        },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
      this.leadModel.countDocuments({
        ...leadScope,
        status: 'open',
        nextActionAt: { $lt: new Date() },
      }),
      this.convModel.countDocuments({
        tenantId: tid,
        ...convScope,
        unreadCount: { $gt: 0 },
      }),
      this.convModel.countDocuments({
        tenantId: tid,
        ...convScope,
        escalated: true,
        status: 'open',
      }),
    ]);

    const kpi = (series: number[], previous: number, value?: number): Kpi => {
      const v = value ?? series.reduce((a, b) => a + b, 0);
      return {
        value: Math.round(v * 100) / 100,
        previous,
        delta: deltaPct(v, previous),
        series,
      };
    };

    const inbound = messageRows.inbound;
    const aiShareSeries = messageRows.ai.map((a, i) => {
      const total = a + messageRows.human[i];
      return total ? Math.round((a / total) * 100) : 0;
    });
    const aiTotal = sum(messageRows.ai);
    const humanTotal = sum(messageRows.human);
    const aiShare =
      aiTotal + humanTotal
        ? Math.round((aiTotal / (aiTotal + humanTotal)) * 100)
        : 0;
    const aiSharePrev =
      messagePrev.ai + messagePrev.human
        ? Math.round(
            (messagePrev.ai / (messagePrev.ai + messagePrev.human)) * 100,
          )
        : 0;

    const wonDealsSeries = wonSeries.counts;
    const wonCount = sum(wonDealsSeries);
    const conversion =
      wonCount + lostCount
        ? Math.round((wonCount / (wonCount + lostCount)) * 100)
        : 0;
    const wonPrevRow = wonPrev[0] ?? { value: 0, count: 0 };
    const conversionPrev =
      wonPrevRow.count + lostPrev
        ? Math.round((wonPrevRow.count / (wonPrevRow.count + lostPrev)) * 100)
        : 0;

    const funnel = LEAD_STAGES.filter((s) => !s.outcome).map((s) => {
      const row = funnelRows.find((r) => r._id === s.key);
      return {
        key: s.key,
        label: s.label,
        color: s.color,
        probability: s.probability,
        count: row?.count ?? 0,
        value: row?.value ?? 0,
      };
    });
    const openValue = sum(funnel.map((f) => f.value));
    const weighted = Math.round(
      sum(funnel.map((f) => (f.value * f.probability) / 100)),
    );

    const agentIds = [
      ...new Set([
        ...agentRows.map((r) => String(r._id)),
        ...handoffRows.filter((r) => r._id).map((r) => String(r._id)),
      ]),
    ].filter((id) => Types.ObjectId.isValid(id));
    const agentDocs = agentIds.length
      ? await this.agentModel
          .find(
            { _id: { $in: agentIds.map((id) => new Types.ObjectId(id)) } },
            { name: 1 },
          )
          .lean()
          .exec()
      : [];

    const label = (k: string) => CHANNEL_LABEL[k] ?? k;

    return {
      range: {
        key: range.key,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        bucket: range.bucket,
        buckets: range.buckets,
        timezone: range.timezone,
      },
      channel,
      kpis: {
        wonValue: kpi(wonSeries.values, wonPrevRow.value),
        wonDeals: kpi(wonDealsSeries, wonPrevRow.count),
        newContacts: kpi(contactSeries, contactsPrev),
        newConversations: kpi(convSeries, convPrev),
        inbound: kpi(inbound, messagePrev.inbound),
        aiShare: kpi(aiShareSeries, aiSharePrev, aiShare),
        newLeads: kpi(leadSeries, leadsPrev),
        conversionRate: kpi(
          wonDealsSeries.map((w, i) => {
            const lost = wonSeries.lost[i] ?? 0;
            return w + lost ? Math.round((w / (w + lost)) * 100) : 0;
          }),
          conversionPrev,
          conversion,
        ),
      },
      pipeline: {
        open: sum(funnel.map((f) => f.count)),
        openValue,
        weightedValue: weighted,
      },
      activity: messageRows,
      heatmap: heatRows,
      response: responseStats(
        samples.map(
          (m): ResponseSample => ({
            conversationId: String(m.conversationId),
            direction: m.direction as 'in' | 'out',
            author: m.author,
            at: new Date(m.at),
          }),
        ),
      ),
      channels: channelRows
        .filter((r) => !channel || r._id === channel)
        .map((r) => ({ key: r._id, label: label(r._id), count: r.count })),
      sources: sourceRows
        .filter((r) => r._id)
        .map((r) => ({ key: r._id, label: label(r._id), count: r.count })),
      funnel,
      outcomes: {
        won: wonCount,
        lost: lostCount,
        lostSeries: wonSeries.lost,
        lostReasons: lostReasons.map((r) => ({
          key: r._id,
          label: r._id,
          count: r.count,
        })),
      },
      agents: agentIds
        .map((id) => {
          const replies = agentRows.find((r) => String(r._id) === id);
          return {
            id,
            name:
              agentDocs.find((a) => String(a._id) === id)?.name ??
              'Agente eliminado',
            replies: replies?.replies ?? 0,
            conversations: replies?.conversations ?? 0,
            handoffs: handoffRows.find((r) => String(r._id) === id)?.count ?? 0,
          };
        })
        .sort((a, b) => b.replies - a.replies)
        .slice(0, 6),
      marketing: {
        campaigns,
        recovery,
        forms,
        events,
        suppression: { added: suppressionAdded },
      },
      prospecting,
      tags: tags.map((t) => ({ key: t._id, label: t._id, count: t.count })),
      alerts: { overdueTasks: overdue, unread, escalated },
    };
  }

  // ── Series ─────────────────────────────────────────────────────────────

  private dateKey(field: string, range: ResolvedRange) {
    return {
      $dateToString: {
        format: bucketFormat(range.bucket),
        date: `$${field}`,
        timezone: range.timezone,
      },
    };
  }

  private async countSeries<T>(
    model: Model<T>,
    match: Record<string, unknown>,
    field: string,
    range: ResolvedRange,
  ): Promise<number[]> {
    const rows = await model.aggregate<{ _id: string; value: number }>([
      { $match: { ...match, [field]: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: this.dateKey(field, range), value: { $sum: 1 } } },
    ]);
    return fillSeries(range.buckets, rows);
  }

  /** Valor y conteo de ganadas por cubeta, más las perdidas para la conversión. */
  private async wonLostSeries(
    scope: Record<string, unknown>,
    range: ResolvedRange,
  ): Promise<{ values: number[]; counts: number[]; lost: number[] }> {
    const rows = await this.leadModel.aggregate<{
      _id: { b: string; s: string };
      value: number;
      count: number;
    }>([
      {
        $match: {
          ...scope,
          status: { $in: ['won', 'lost'] },
          closedAt: { $gte: range.from, $lte: range.to },
        },
      },
      {
        $group: {
          _id: { b: this.dateKey('closedAt', range), s: '$status' },
          value: { $sum: '$value' },
          count: { $sum: 1 },
        },
      },
    ]);
    const pick = (s: string, k: 'value' | 'count') =>
      fillSeries(
        range.buckets,
        rows
          .filter((r) => r._id.s === s)
          .map((r) => ({ _id: r._id.b, value: r[k] })),
      );
    return {
      values: pick('won', 'value'),
      counts: pick('won', 'count'),
      lost: pick('lost', 'count'),
    };
  }

  private async messageSeries(
    tid: Types.ObjectId,
    range: ResolvedRange,
    scope: Record<string, unknown>,
  ): Promise<{ inbound: number[]; ai: number[]; human: number[] }> {
    const rows = await this.msgModel.aggregate<{
      _id: { b: string; k: string };
      value: number;
    }>([
      {
        $match: {
          tenantId: tid,
          ...scope,
          at: { $gte: range.from, $lte: range.to },
          author: { $in: ['customer', 'agent', 'human'] },
        },
      },
      {
        $group: {
          _id: { b: this.dateKey('at', range), k: '$author' },
          value: { $sum: 1 },
        },
      },
    ]);
    const pick = (k: string) =>
      fillSeries(
        range.buckets,
        rows
          .filter((r) => r._id.k === k)
          .map((r) => ({ _id: r._id.b, value: r.value })),
      );
    return {
      inbound: pick('customer'),
      ai: pick('agent'),
      human: pick('human'),
    };
  }

  private async messageTotals(
    tid: Types.ObjectId,
    at: Record<string, Date>,
    scope: Record<string, unknown>,
  ): Promise<{ inbound: number; ai: number; human: number }> {
    const rows = await this.msgModel.aggregate<{ _id: string; value: number }>([
      {
        $match: {
          tenantId: tid,
          ...scope,
          at,
          author: { $in: ['customer', 'agent', 'human'] },
        },
      },
      { $group: { _id: '$author', value: { $sum: 1 } } },
    ]);
    const get = (k: string) => rows.find((r) => r._id === k)?.value ?? 0;
    return { inbound: get('customer'), ai: get('agent'), human: get('human') };
  }

  /** Mensajes de clientes por día de la semana (lunes primero) y hora. */
  private async heatmap(
    tid: Types.ObjectId,
    range: ResolvedRange,
    scope: Record<string, unknown>,
  ): Promise<number[][]> {
    const rows = await this.msgModel.aggregate<{
      _id: { d: number; h: number };
      value: number;
    }>([
      {
        $match: {
          tenantId: tid,
          ...scope,
          at: { $gte: range.from, $lte: range.to },
          direction: 'in',
        },
      },
      {
        $group: {
          _id: {
            d: { $isoDayOfWeek: { date: '$at', timezone: range.timezone } },
            h: { $hour: { date: '$at', timezone: range.timezone } },
          },
          value: { $sum: 1 },
        },
      },
    ]);
    const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    for (const r of rows) {
      if (r._id.d >= 1 && r._id.d <= 7 && r._id.h >= 0 && r._id.h < 24)
        grid[r._id.d - 1][r._id.h] = r.value;
    }
    return grid;
  }

  private inboundByChannel(tid: Types.ObjectId, range: ResolvedRange) {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          tenantId: tid,
          at: { $gte: range.from, $lte: range.to },
          direction: 'in',
        },
      },
      { $group: { _id: '$conversationId', count: { $sum: 1 } } },
      {
        $lookup: {
          from: this.convModel.collection.name,
          localField: '_id',
          foreignField: '_id',
          as: 'conv',
        },
      },
      { $unwind: '$conv' },
      { $group: { _id: '$conv.channel', count: { $sum: '$count' } } },
      { $sort: { count: -1 } },
    ];
    return this.msgModel.aggregate<{ _id: string; count: number }>(pipeline);
  }

  /** Respuestas por agente: el mensaje no guarda el agente, la conversación sí. */
  private agentReplies(
    tid: Types.ObjectId,
    range: ResolvedRange,
    scope: Record<string, unknown>,
  ) {
    return this.msgModel.aggregate<{
      _id: Types.ObjectId;
      replies: number;
      conversations: number;
    }>([
      {
        $match: {
          tenantId: tid,
          ...scope,
          at: { $gte: range.from, $lte: range.to },
          author: 'agent',
        },
      },
      { $group: { _id: '$conversationId', replies: { $sum: 1 } } },
      {
        $lookup: {
          from: this.convModel.collection.name,
          localField: '_id',
          foreignField: '_id',
          as: 'conv',
        },
      },
      { $unwind: '$conv' },
      { $match: { 'conv.agentId': { $ne: null } } },
      {
        $group: {
          _id: '$conv.agentId',
          replies: { $sum: '$replies' },
          conversations: { $sum: 1 },
        },
      },
    ]);
  }

  // ── Marketing y crecimiento ────────────────────────────────────────────

  private async campaignStats(tid: Types.ObjectId, range: ResolvedRange) {
    const rows = await this.campaignModel.aggregate<{
      _id: string;
      sent: number;
      recipients: number;
    }>([
      {
        $match: {
          tenantId: tid,
          status: 'sent',
          sentAt: { $gte: range.from, $lte: range.to },
        },
      },
      {
        $group: {
          _id: '$type',
          sent: { $sum: 1 },
          recipients: { $sum: '$recipientCount' },
        },
      },
    ]);
    return {
      sent: sum(rows.map((r) => r.sent)),
      recipients: sum(rows.map((r) => r.recipients)),
      byType: rows.map((r) => ({
        key: r._id,
        label: r._id === 'email' ? 'Correo' : 'WhatsApp',
        count: r.sent,
        value: r.recipients,
      })),
    };
  }

  private async recoveryStats(tid: Types.ObjectId, range: ResolvedRange) {
    const rows = await this.recoveryModel.aggregate<{
      _id: string;
      count: number;
    }>([
      { $match: { tenantId: tid, updatedAt: { $gte: range.from } } },
      { $unwind: '$segments' },
      { $unwind: '$segments.recipients' },
      {
        $match: {
          'segments.recipients.sentAt': { $gte: range.from, $lte: range.to },
        },
      },
      {
        $group: { _id: '$segments.recipients.sendStatus', count: { $sum: 1 } },
      },
    ]);
    const get = (k: string) => rows.find((r) => r._id === k)?.count ?? 0;
    return { sent: get('sent'), failed: get('failed') };
  }

  private async formStats(tid: Types.ObjectId, range: ResolvedRange) {
    const rows = await this.submissionModel.aggregate<{
      _id: Types.ObjectId;
      count: number;
    }>([
      {
        $match: {
          tenantId: tid,
          createdAt: { $gte: range.from, $lte: range.to },
        },
      },
      { $group: { _id: '$formId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const top = rows.slice(0, 5);
    const names = top.length
      ? await this.formModel
          .find({ _id: { $in: top.map((r) => r._id) } }, { name: 1 })
          .lean()
          .exec()
      : [];
    return {
      submissions: sum(rows.map((r) => r.count)),
      top: top.map((r) => ({
        key: String(r._id),
        label:
          names.find((n) => String(n._id) === String(r._id))?.name ??
          'Formulario eliminado',
        count: r.count,
      })),
    };
  }

  private async eventStats(tid: Types.ObjectId, range: ResolvedRange) {
    const [row] = await this.registrationModel.aggregate<{
      registrations: number;
      attendees: number;
      checkedIn: number;
    }>([
      {
        $match: {
          tenantId: tid,
          status: { $ne: 'cancelled' },
          createdAt: { $gte: range.from, $lte: range.to },
        },
      },
      {
        $group: {
          _id: null,
          registrations: { $sum: 1 },
          attendees: { $sum: { $ifNull: ['$partySize', 1] } },
          checkedIn: { $sum: { $cond: ['$checkedIn', 1, 0] } },
        },
      },
    ]);
    return {
      registrations: row?.registrations ?? 0,
      attendees: row?.attendees ?? 0,
      checkedIn: row?.checkedIn ?? 0,
    };
  }

  private async prospectStats(tid: Types.ObjectId, range: ResolvedRange) {
    const [row] = await this.prospectModel.aggregate<{
      found: number;
      researched: number;
      withMaterial: number;
      contacted: number;
      converted: number;
    }>([
      {
        $match: {
          tenantId: tid,
          createdAt: { $gte: range.from, $lte: range.to },
        },
      },
      {
        $group: {
          _id: null,
          found: { $sum: 1 },
          researched: {
            $sum: { $cond: [{ $eq: ['$research.state', 'done'] }, 1, 0] },
          },
          withMaterial: {
            $sum: { $cond: [{ $eq: ['$material.state', 'done'] }, 1, 0] },
          },
          contacted: {
            $sum: {
              $cond: [
                { $in: ['$status', ['contacted', 'meeting', 'converted']] },
                1,
                0,
              ],
            },
          },
          converted: {
            $sum: { $cond: [{ $ifNull: ['$leadId', false] }, 1, 0] },
          },
        },
      },
    ]);
    return {
      found: row?.found ?? 0,
      researched: row?.researched ?? 0,
      withMaterial: row?.withMaterial ?? 0,
      contacted: row?.contacted ?? 0,
      converted: row?.converted ?? 0,
    };
  }
}

function sum(list: number[]): number {
  return list.reduce((a, b) => a + (b || 0), 0);
}

export type { ResponseStats };
