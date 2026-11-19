import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model, PipelineStage, Types } from 'mongoose';
import { isLeadSupervisor } from '../auth/permissions';
import { CONTACT_ACTIVITY_TYPES } from '../customers/contact-activity.schema';
import { resolveRange, safeTimezone } from './analytics.helpers';
import { CHANNEL_FILTERS } from './dashboard-analytics.service';

export interface UserPerformanceRow {
  id: string;
  name: string;
  email: string;
  role: string;
  /** Mensajes enviados a mano desde la bandeja en el periodo. */
  messages: number;
  /** Chats que tiene asignados ahora mismo (no depende del periodo). */
  openChats: number;
  newLeads: number;
  wonDeals: number;
  wonValue: number;
  lostDeals: number;
  newContacts: number;
  /** Contactos a su cargo hoy. */
  assignedContacts: number;
  /** De esos, cuántos no tienen ninguna actividad manual en el periodo. */
  idleContacts: number;
  activities: number;
  calls: number;
}

type Metric = Exclude<
  keyof UserPerformanceRow,
  'id' | 'name' | 'email' | 'role'
>;

export const USER_METRICS: Metric[] = [
  'messages',
  'openChats',
  'newLeads',
  'wonDeals',
  'wonValue',
  'lostDeals',
  'newContacts',
  'assignedContacts',
  'idleContacts',
  'activities',
  'calls',
];

export interface UserPerformance {
  range: string;
  from: Date;
  to: Date;
  channel: string | null;
  /** `team`: supervisores, ven a todos; `self`: solo la propia fila. */
  scope: 'team' | 'self';
  users: UserPerformanceRow[];
  totals: Record<Metric, number>;
}

type Counts = Map<string, number>;

/** Rendimiento de cada usuario de la empresa en el periodo (HU20). */
@Injectable()
export class DashboardUsersService {
  constructor(@InjectConnection() private conn: Connection) {}

  private model(name: string): Model<any> | null {
    return (this.conn.models[name] as Model<any> | undefined) ?? null;
  }

  /** `{ userId: n }` agrupando por `field`; si el modelo no existe, vacío. */
  private async group(
    modelName: string,
    match: Record<string, unknown>,
    field: string,
    sum: unknown = 1,
    extra: PipelineStage[] = [],
  ): Promise<Counts> {
    const m = this.model(modelName);
    if (!m) return new Map();
    const rows = await m
      .aggregate<{
        _id: Types.ObjectId;
        n: number;
      }>([
        { $match: match },
        ...extra,
        { $group: { _id: `$${field}`, n: { $sum: sum } } },
      ])
      .exec();
    return new Map(rows.filter((r) => r._id).map((r) => [String(r._id), r.n]));
  }

  /** Varias sumas por usuario en una sola agregación. */
  private async groupMany<K extends string>(
    modelName: string,
    match: Record<string, unknown>,
    field: string,
    sums: Record<K, unknown>,
    extra: PipelineStage[] = [],
  ): Promise<Record<K, Counts>> {
    const out = Object.fromEntries(
      Object.keys(sums).map((k) => [k, new Map<string, number>()]),
    ) as Record<K, Counts>;
    const m = this.model(modelName);
    if (!m) return out;
    const group: Record<string, unknown> = { _id: `$${field}` };
    for (const k of Object.keys(sums)) group[k] = { $sum: sums[k as K] };
    const rows = await m
      .aggregate<
        Record<string, unknown> & { _id: Types.ObjectId }
      >([{ $match: match }, ...extra, { $group: group } as PipelineStage])
      .exec();
    for (const r of rows) {
      if (!r._id) continue;
      for (const k of Object.keys(sums) as K[])
        out[k].set(String(r._id), Number(r[k]) || 0);
    }
    return out;
  }

  async performance(
    tenantId: string,
    userId: string,
    role: string,
    query: { range?: string; tz?: string; channel?: string },
  ): Promise<UserPerformance> {
    const range = resolveRange(query.range, safeTimezone(query.tz));
    const channel = (CHANNEL_FILTERS as readonly string[]).includes(
      query.channel ?? '',
    )
      ? (query.channel as string)
      : null;
    const tid = new Types.ObjectId(tenantId);
    const scope: 'team' | 'self' = isLeadSupervisor(role) ? 'team' : 'self';
    const self = new Types.ObjectId(userId);
    const only = (field: string) => (scope === 'self' ? { [field]: self } : {});
    const period = { $gte: range.from, $lte: range.to };

    const users = await (this.model('User')
      ?.find(
        {
          tenantId: tid,
          isActive: { $ne: false },
          role: { $ne: 'SUPERADMIN' },
          ...(scope === 'self' ? { _id: self } : {}),
        },
        { name: 1, email: 1, role: 1 },
      )
      .sort({ name: 1, email: 1 })
      .lean<
        { _id: Types.ObjectId; name?: string; email: string; role: string }[]
      >()
      .exec() ?? Promise.resolve([]));

    // Con canal, los mensajes y chats se limitan a las conversaciones de ese canal.
    const byChannel: PipelineStage[] = channel
      ? [
          {
            $lookup: {
              from:
                this.model('Conversation')?.collection.name ?? 'conversations',
              localField: 'conversationId',
              foreignField: '_id',
              as: 'conv',
              pipeline: [{ $project: { channel: 1 } }],
            },
          },
          { $match: { 'conv.channel': channel } },
        ]
      : [];

    const manualTypes = [...CONTACT_ACTIVITY_TYPES];
    const [
      messages,
      openChats,
      newLeads,
      won,
      lostDeals,
      newContacts,
      care,
      activities,
      calls,
    ] = await Promise.all([
      this.group(
        'Message',
        {
          tenantId: tid,
          direction: 'out',
          author: 'human',
          sentBy: { $exists: true, ...(scope === 'self' ? { $eq: self } : {}) },
          at: period,
          inTrash: { $ne: true },
        },
        'sentBy',
        1,
        byChannel,
      ),
      this.group(
        'Conversation',
        {
          tenantId: tid,
          takenOverBy: { $exists: true, $ne: null },
          ...only('takenOverBy'),
          // Cerrar un chat no borra quién lo atendía: solo cuentan los abiertos.
          status: 'open',
          inTrash: { $ne: true },
          blocked: { $ne: true },
          ...(channel ? { channel } : {}),
        },
        'takenOverBy',
      ),
      this.group(
        'Lead',
        { tenantId: tid, ...only('ownerId'), createdAt: period },
        'ownerId',
      ),
      this.groupMany(
        'Lead',
        { tenantId: tid, ...only('ownerId'), status: 'won', closedAt: period },
        'ownerId',
        { wonDeals: 1, wonValue: { $ifNull: ['$value', 0] } },
      ),
      this.group(
        'Lead',
        { tenantId: tid, ...only('ownerId'), status: 'lost', closedAt: period },
        'ownerId',
      ),
      this.group(
        'Customer',
        { tenantId: tid, ...only('ownerId'), createdAt: period },
        'ownerId',
      ),
      // Contactos a cargo y cuántos no tuvieron seguimiento en el periodo.
      this.groupMany(
        'Customer',
        {
          tenantId: tid,
          ownerId: {
            $exists: true,
            $ne: null,
            ...(scope === 'self' ? { $eq: self } : {}),
          },
        },
        'ownerId',
        {
          assignedContacts: 1,
          idleContacts: { $cond: [{ $eq: [{ $size: '$worked' }, 0] }, 1, 0] },
        },
        [
          {
            $lookup: {
              from:
                this.model('ContactActivity')?.collection.name ??
                'contactactivities',
              let: { cid: '$_id' },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ['$customerId', '$$cid'] },
                    tenantId: tid,
                    type: { $in: manualTypes },
                    at: period,
                  },
                },
                { $limit: 1 },
                { $project: { _id: 1 } },
              ],
              as: 'worked',
            },
          },
        ],
      ),
      this.group(
        'ContactActivity',
        {
          tenantId: tid,
          ...only('createdBy'),
          type: { $in: manualTypes },
          createdAt: period,
        },
        'createdBy',
      ),
      this.group(
        'Call',
        { tenantId: tid, ...only('answeredBy'), startedAt: period },
        'answeredBy',
      ),
    ]);

    const metrics: Record<Metric, Counts> = {
      messages,
      openChats,
      newLeads,
      wonDeals: won.wonDeals,
      wonValue: won.wonValue,
      lostDeals,
      newContacts,
      assignedContacts: care.assignedContacts,
      idleContacts: care.idleContacts,
      activities,
      calls,
    };
    const rows: UserPerformanceRow[] = users.map((u) => {
      const id = String(u._id);
      const row = {
        id,
        name: u.name || u.email,
        email: u.email,
        role: u.role,
      } as UserPerformanceRow;
      for (const k of USER_METRICS) row[k] = metrics[k].get(id) ?? 0;
      return row;
    });
    const totals = Object.fromEntries(
      USER_METRICS.map((k) => [k, rows.reduce((s, r) => s + r[k], 0)]),
    ) as Record<Metric, number>;

    return {
      range: range.key,
      from: range.from,
      to: range.to,
      channel,
      scope,
      users: rows,
      totals,
    };
  }
}
