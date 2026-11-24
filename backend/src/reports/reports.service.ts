import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model, PipelineStage, Types } from 'mongoose';
import { Lead } from '../leads/lead.schema';
import { Customer } from '../customers/customer.schema';
import { Conversation } from '../conversations/conversation.schema';
import { Campaign } from '../campaigns/campaign.schema';
import { EventRegistration } from '../events/event-registration.schema';
import { Event } from '../events/event.schema';
import { User } from '../users/user.schema';
import { MailService } from '../mail/mail.service';
import { Report } from './report.schema';
import {
  CHARTS,
  resolveRange,
  validateDefinition,
  type ReportChart,
  type ReportDefinition,
  type ReportGroup,
} from './report-definition';

export interface ReportRow {
  key: string | null;
  label: string;
  value: number;
  count: number;
}
export interface ReportResult {
  rows: ReportRow[];
  total: number;
  from: string;
  to: string;
  metric: string;
  groupBy: string;
}
export interface Viewer {
  userId: string;
  role: string;
  tenantId: string;
}
export interface ReportInput extends Partial<ReportDefinition> {
  name?: string;
  chart?: ReportChart;
  pinned?: boolean;
  sharedRoles?: string[];
  schedule?: { frequency: 'weekly' | 'monthly'; emails: string[] } | null;
}

const MANAGE_ROLES = ['TENANT_ADMIN', 'MANAGER'];
const DAY = 86_400_000;
const TZ = 'America/Lima';
const MAX_GROUPS = 100;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DATE_FORMAT: Partial<Record<ReportGroup, string>> = {
  day: '%Y-%m-%d',
  week: '%G-S%V',
  month: '%Y-%m',
};
const FIELD: Partial<Record<ReportGroup, string>> = {
  owner: '$ownerId',
  stage: '$stage',
  status: '$status',
  source: '$source',
  channel: '$channel',
  type: '$type',
  tag: '$tags',
  event: '$eventId',
};
const EMPTY_LABEL: Partial<Record<ReportGroup, string>> = {
  owner: 'Sin asignar',
  tag: 'Sin etiqueta',
  none: 'Total',
};
const round = (n: number) => Math.round(n * 100) / 100;

const csvCell = (v: unknown) => {
  const s =
    v === undefined || v === null
      ? ''
      : typeof v === 'number'
        ? String(v)
        : (v as { toString(): string }).toString();
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

/** Reportes configurables (HU64): agregaciones de Mongo con rango acotado. */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectModel(Report.name) private reports: Model<Report>,
    @InjectModel(Lead.name) private leads: Model<Lead>,
    @InjectModel(Customer.name) private customers: Model<Customer>,
    @InjectModel(Conversation.name) private conversations: Model<Conversation>,
    @InjectModel(Campaign.name) private campaigns: Model<Campaign>,
    @InjectModel(EventRegistration.name)
    private registrations: Model<EventRegistration>,
    @InjectModel(Event.name) private events: Model<Event>,
    @InjectModel(User.name) private users: Model<User>,
    private mail: MailService,
  ) {}

  // ── Ejecución ──────────────────────────────────────────────────────────

  private model(source: ReportDefinition['source']): Model<any> {
    return {
      leads: this.leads,
      customers: this.customers,
      conversations: this.conversations,
      campaigns: this.campaigns,
      registrations: this.registrations,
    }[source];
  }

  private dateField(d: ReportDefinition) {
    return d.filters?.dateField ?? 'createdAt';
  }

  private match(
    tenantId: string,
    d: ReportDefinition,
    from: Date,
    to: Date,
  ): Record<string, unknown> {
    const f = d.filters ?? {};
    const m: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      [this.dateField(d)]: { $gte: from, $lte: to },
    };
    if (f.status) m.status = f.status;
    if (f.stage) m.stage = f.stage;
    if (f.source) m.source = f.source;
    if (f.channel) m.channel = f.channel;
    if (f.tag) m.tags = f.tag;
    if (f.ownerId)
      m.ownerId = Types.ObjectId.isValid(f.ownerId)
        ? new Types.ObjectId(f.ownerId)
        : null;
    if (d.metric === 'avg_days_to_close') {
      m.status = 'won';
      m.closedAt = { ...(m.closedAt ?? {}), $ne: null };
    }
    return m;
  }

  private accumulators(d: ReportDefinition) {
    const value =
      d.metric === 'sum_value'
        ? {
            $sum:
              d.source === 'campaigns'
                ? { $ifNull: ['$stats.sent', 0] }
                : { $ifNull: ['$value', 0] },
          }
        : d.metric === 'conversion_rate'
          ? { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } }
          : d.metric === 'avg_days_to_close'
            ? {
                $avg: {
                  $divide: [{ $subtract: ['$closedAt', '$createdAt'] }, DAY],
                },
              }
            : { $sum: 1 };
    return { value, count: { $sum: 1 } };
  }

  private finalValue(d: ReportDefinition, raw: number, count: number) {
    if (d.metric === 'conversion_rate')
      return count ? round((raw / count) * 100) : 0;
    return round(raw ?? 0);
  }

  async run(
    tenantId: string,
    input: Partial<ReportDefinition>,
    now = new Date(),
  ): Promise<ReportResult> {
    const d = validateDefinition(input);
    const { from, to } = resolveRange(d.filters, now);
    const match = this.match(tenantId, d, from, to);
    const acc = this.accumulators(d);
    const key: unknown =
      d.groupBy === 'none'
        ? null
        : DATE_FORMAT[d.groupBy]
          ? {
              $dateToString: {
                format: DATE_FORMAT[d.groupBy],
                date: `$${this.dateField(d)}`,
                timezone: TZ,
              },
            }
          : FIELD[d.groupBy];
    const pipeline: PipelineStage[] = [{ $match: match }];
    if (d.groupBy === 'tag')
      pipeline.push({
        $unwind: { path: '$tags', preserveNullAndEmptyArrays: true },
      });
    pipeline.push({ $group: { _id: key, ...acc } }, { $limit: 1000 });
    const totalPipe: PipelineStage[] = [
      { $match: match },
      { $group: { _id: null, ...acc } },
    ];

    const model = this.model(d.source);
    const [grouped, totals] = await Promise.all([
      model
        .aggregate<{ _id: unknown; value: number; count: number }>(pipeline)
        .exec(),
      model.aggregate<{ value: number; count: number }>(totalPipe).exec(),
    ]);
    let rows: ReportRow[] = grouped.map((g) => ({
      key:
        g._id === null || g._id === undefined || g._id === ''
          ? null
          : String(g._id as string),
      label: '',
      value: this.finalValue(d, g.value, g.count),
      count: g.count,
    }));
    const isDate = !!DATE_FORMAT[d.groupBy];
    rows.sort((a, b) =>
      isDate
        ? String(a.key).localeCompare(String(b.key))
        : b.value - a.value || b.count - a.count,
    );
    rows = rows.slice(0, MAX_GROUPS);
    await this.label(tenantId, d.groupBy, rows);
    const t = totals[0];
    return {
      rows,
      total: t ? this.finalValue(d, t.value, t.count) : 0,
      from: from.toISOString(),
      to: to.toISOString(),
      metric: d.metric,
      groupBy: d.groupBy,
    };
  }

  private async label(
    tenantId: string,
    groupBy: ReportGroup,
    rows: ReportRow[],
  ) {
    const ids = rows
      .map((r) => r.key)
      .filter((k): k is string => !!k && Types.ObjectId.isValid(k));
    let names = new Map<string, string>();
    if (groupBy === 'owner' && ids.length) {
      const us = await this.users
        .find({ _id: { $in: ids }, tenantId: new Types.ObjectId(tenantId) })
        .select('name email')
        .lean()
        .exec();
      names = new Map(us.map((u) => [String(u._id), u.name || u.email]));
    }
    if (groupBy === 'event' && ids.length) {
      const es = await this.events
        .find({ _id: { $in: ids }, tenantId: new Types.ObjectId(tenantId) })
        .select('title')
        .lean()
        .exec();
      names = new Map(es.map((e) => [String(e._id), e.title]));
    }
    for (const r of rows)
      r.label =
        r.key === null
          ? (EMPTY_LABEL[groupBy] ?? 'Sin dato')
          : (names.get(r.key) ?? r.key);
  }

  // ── Guardados ──────────────────────────────────────────────────────────

  private canSee(r: Pick<Report, 'createdBy' | 'sharedRoles'>, v: Viewer) {
    return (
      v.role === 'TENANT_ADMIN' ||
      String(r.createdBy) === v.userId ||
      (r.sharedRoles ?? []).includes(v.role)
    );
  }

  private assertCanManage(v: Viewer) {
    if (!MANAGE_ROLES.includes(v.role))
      throw new ForbiddenException(
        'Solo el administrador o un gerente crean reportes',
      );
  }

  private clean(input: ReportInput, partial = false) {
    const out: Record<string, unknown> = {};
    if (
      !partial ||
      input.source !== undefined ||
      input.metric !== undefined ||
      input.groupBy !== undefined ||
      input.filters !== undefined
    ) {
      Object.assign(out, validateDefinition(input));
    }
    if (input.name !== undefined || !partial) {
      const name = String(input.name ?? '').trim();
      if (!name) throw new BadRequestException('Ponle un nombre al reporte');
      out.name = name.slice(0, 120);
    }
    if (input.chart !== undefined) {
      if (!CHARTS.includes(input.chart))
        throw new BadRequestException('Visualización no válida');
      out.chart = input.chart;
    }
    if (input.pinned !== undefined) out.pinned = !!input.pinned;
    if (input.sharedRoles !== undefined)
      out.sharedRoles = (
        Array.isArray(input.sharedRoles) ? input.sharedRoles : []
      )
        .map(String)
        .slice(0, 20);
    if (input.schedule !== undefined) {
      if (!input.schedule) out.schedule = null;
      else {
        if (!['weekly', 'monthly'].includes(input.schedule.frequency))
          throw new BadRequestException('Frecuencia no válida');
        const emails = [
          ...new Set(
            (input.schedule.emails ?? [])
              .map((e) => String(e).trim().toLowerCase())
              .filter(Boolean),
          ),
        ];
        if (
          !emails.length ||
          emails.length > 10 ||
          emails.some((e) => !EMAIL_RE.test(e))
        )
          throw new BadRequestException('Indica de 1 a 10 correos válidos');
        out.schedule = { frequency: input.schedule.frequency, emails };
      }
    }
    return out;
  }

  async create(v: Viewer, input: ReportInput) {
    this.assertCanManage(v);
    const data = this.clean(input);
    return this.reports.create({
      ...data,
      tenantId: new Types.ObjectId(v.tenantId),
      createdBy: new Types.ObjectId(v.userId),
    });
  }

  private async mine(v: Viewer, id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Reporte no encontrado');
    const r = await this.reports
      .findOne({ _id: id, tenantId: new Types.ObjectId(v.tenantId) })
      .exec();
    if (!r || !this.canSee(r, v))
      throw new NotFoundException('Reporte no encontrado');
    return r;
  }

  async update(v: Viewer, id: string, input: ReportInput) {
    this.assertCanManage(v);
    const r = await this.mine(v, id);
    if (v.role !== 'TENANT_ADMIN' && String(r.createdBy) !== v.userId)
      throw new ForbiddenException(
        'Solo quien lo creó o el administrador lo modifican',
      );
    const merged: ReportInput = {
      source: r.source,
      metric: r.metric,
      groupBy: r.groupBy,
      filters: r.filters,
      ...input,
    };
    const data = this.clean(merged, true);
    return this.reports
      .findByIdAndUpdate(r._id, { $set: data }, { returnDocument: 'after' })
      .exec();
  }

  async remove(v: Viewer, id: string) {
    this.assertCanManage(v);
    const r = await this.mine(v, id);
    if (v.role !== 'TENANT_ADMIN' && String(r.createdBy) !== v.userId)
      throw new ForbiddenException(
        'Solo quien lo creó o el administrador lo eliminan',
      );
    await this.reports.deleteOne({ _id: r._id }).exec();
    return { deleted: true };
  }

  async list(v: Viewer) {
    const all = await this.reports
      .find({ tenantId: new Types.ObjectId(v.tenantId) })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    return all.filter((r) => this.canSee(r, v));
  }

  async get(v: Viewer, id: string) {
    return this.mine(v, id);
  }

  async runSaved(v: Viewer, id: string) {
    const r = await this.mine(v, id);
    return { report: r, result: await this.run(v.tenantId, r) };
  }

  /** Reportes fijados visibles para quien mira el dashboard, ya calculados. */
  async pinned(v: Viewer) {
    const list = (await this.list(v)).filter((r) => r.pinned).slice(0, 12);
    return Promise.all(
      list.map(async (r) => ({
        report: r,
        result: await this.run(v.tenantId, r).catch(() => null),
      })),
    );
  }

  async exportCsv(v: Viewer, id: string) {
    const { report, result } = await this.runSaved(v, id);
    return { name: report.name, csv: this.toCsv(result) };
  }

  toCsv(result: ReportResult) {
    const lines = [
      ['grupo', 'valor', 'registros'].join(','),
      ...result.rows.map((r) =>
        [r.label, r.value, r.count].map(csvCell).join(','),
      ),
    ];
    lines.push(['Total', result.total, ''].map(csvCell).join(','));
    return lines.join('\n');
  }

  // ── Envío programado ───────────────────────────────────────────────────

  /** Todos los días a las 8:00 de Lima: semanales los lunes, mensuales el día 1. */
  @Cron('0 8 * * *', { timeZone: TZ })
  async sendScheduled(now = new Date()) {
    const local = new Date(now.getTime() - 5 * 3_600_000);
    const freqs: ('weekly' | 'monthly')[] = [];
    if (local.getUTCDay() === 1) freqs.push('weekly');
    if (local.getUTCDate() === 1) freqs.push('monthly');
    if (!freqs.length) return 0;
    const due = await this.reports
      .find({
        'schedule.frequency': { $in: freqs },
        $or: [
          { 'schedule.lastSentAt': null },
          {
            'schedule.lastSentAt': {
              $lt: new Date(now.getTime() - 20 * 3_600_000),
            },
          },
        ],
      })
      .exec();
    let sent = 0;
    for (const r of due) {
      try {
        await this.sendReport(r);
        sent++;
      } catch (err) {
        this.logger.warn(
          `No se pudo enviar el reporte ${String(r._id)}: ${(err as Error).message}`,
        );
      }
    }
    return sent;
  }

  async sendNow(v: Viewer, id: string) {
    const r = await this.mine(v, id);
    if (!r.schedule?.emails?.length)
      throw new BadRequestException('Configura primero los correos del envío');
    await this.sendReport(r);
    return { sent: r.schedule.emails.length };
  }

  private async sendReport(r: Report) {
    const result = await this.run(String(r.tenantId), r);
    const rows = result.rows
      .map(
        (x) =>
          `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(x.label)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${x.value}</td></tr>`,
      )
      .join('');
    const range = `${result.from.slice(0, 10)} al ${result.to.slice(0, 10)}`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px">
      <h2 style="margin:0 0 4px">${escapeHtml(r.name)}</h2>
      <p style="color:#666;margin:0 0 16px">Del ${range}</p>
      <table style="border-collapse:collapse;width:100%">${rows}
        <tr><td style="padding:6px 10px;font-weight:bold">Total</td><td style="padding:6px 10px;text-align:right;font-weight:bold">${result.total}</td></tr>
      </table>
      <p style="color:#999;font-size:12px;margin-top:16px">Enviado por Maya CRM. Para dejar de recibirlo, quita tu correo del envío programado del reporte.</p>
    </div>`;
    for (const to of r.schedule?.emails ?? [])
      await this.mail.sendHtml({ to, subject: `Reporte: ${r.name}`, html });
    await this.reports
      .updateOne(
        { _id: r._id },
        { $set: { 'schedule.lastSentAt': new Date() } },
      )
      .exec();
  }
}
