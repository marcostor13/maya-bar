import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { Lead } from '../leads/lead.schema';
import { LeadActivity } from '../leads/lead-activity.schema';
import { Customer } from '../customers/customer.schema';
import { ContactActivity } from '../customers/contact-activity.schema';
import { User } from '../users/user.schema';
import { PushService } from '../push/push.service';
import { NativePushService } from '../notifications/push.service';
import {
  onAutomationEvent,
  type AutomationEvent,
} from '../automations/automation-bus';
import {
  inSchedule,
  pick,
  type Availability,
  type Candidate,
  type RoutingMode,
} from './routing-pick';
import {
  MATCH_KINDS,
  ROUTING_MODES,
  ROUTING_TARGETS,
  RoutingAssignment,
  RoutingRule,
  type AssignmentReason,
  type MatchKind,
  type RoutingTarget,
} from './routing.schema';

export interface RoutingRuleInput {
  name: string;
  active?: boolean;
  order?: number;
  appliesTo?: RoutingTarget;
  match?: { kind: MatchKind; value?: string };
  mode?: RoutingMode;
  members: { userId: string; weight?: number }[];
  responseMinutes?: number | null;
  onTimeout?: 'next' | 'pool';
}

/** Roles que reciben oportunidades del reparto. */
const SELLER_ROLES = ['TENANT_ADMIN', 'MANAGER', 'MARKETING', 'IMPULSADOR'];

/**
 * Reparto automático (HU59): asigna oportunidades y contactos nuevos sin
 * responsable entre los vendedores disponibles de la regla que coincide, y
 * los pasa al siguiente si no responden a tiempo.
 */
@Injectable()
export class RoutingService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RoutingService.name);
  private off?: () => void;
  private sweeping = false;
  /** Reloj inyectable para las pruebas. */
  clock: () => Date = () => new Date();

  constructor(
    @InjectModel(RoutingRule.name) private rules: Model<RoutingRule>,
    @InjectModel(RoutingAssignment.name)
    private assignments: Model<RoutingAssignment>,
    @InjectModel(Lead.name) private leads: Model<Lead>,
    @InjectModel(LeadActivity.name) private leadActivities: Model<LeadActivity>,
    @InjectModel(Customer.name) private customers: Model<Customer>,
    @InjectModel(ContactActivity.name)
    private contactActivities: Model<ContactActivity>,
    @InjectModel(User.name) private users: Model<User>,
    private push: PushService,
    private nativePush: NativePushService,
  ) {}

  onModuleInit() {
    this.off = onAutomationEvent((e) => {
      void this.onEvent(e).catch((err) =>
        this.logger.error(`Reparto (${e.type}): ${String(err)}`),
      );
    });
  }

  onApplicationShutdown() {
    this.off?.();
  }

  // ── Reglas ─────────────────────────────────────────────────────────────

  list(tenantId: string) {
    return this.rules
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ order: 1, createdAt: 1 })
      .populate('members.userId', 'name email')
      .lean()
      .exec();
  }

  async create(tenantId: string, input: RoutingRuleInput) {
    const clean = await this.validate(tenantId, input);
    const last = await this.rules
      .findOne({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ order: -1 })
      .select('order')
      .lean()
      .exec();
    return this.rules.create({
      ...clean,
      tenantId: new Types.ObjectId(tenantId),
      order: input.order ?? (last ? last.order + 1 : 0),
    });
  }

  async update(tenantId: string, id: string, input: RoutingRuleInput) {
    const rule = await this.owned(tenantId, id);
    const clean = await this.validate(tenantId, input);
    Object.assign(rule, clean);
    if (input.order !== undefined) rule.order = Number(input.order);
    // Si cambió el grupo, el turno empieza de nuevo.
    if (rule.cursor >= rule.members.length) rule.cursor = -1;
    await rule.save();
    return rule;
  }

  async remove(tenantId: string, id: string) {
    const rule = await this.owned(tenantId, id);
    await this.rules.deleteOne({ _id: rule._id }).exec();
    return { deleted: true };
  }

  log(tenantId: string, limit = 100) {
    return this.assignments
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ at: -1 })
      .limit(Math.min(limit, 500))
      .populate('userId', 'name')
      .populate('fromUserId', 'name')
      .populate('leadId', 'title')
      .populate('customerId', 'name')
      .populate('ruleId', 'name')
      .lean()
      .exec();
  }

  async availability(userId: string) {
    const u = await this.users
      .findById(userId)
      .select('available availability')
      .lean()
      .exec();
    if (!u) throw new NotFoundException('Usuario no encontrado');
    return {
      available: u.available !== false,
      availability: u.availability ?? null,
    };
  }

  async setAvailability(
    userId: string,
    input: { available?: boolean; availability?: Availability | null },
  ) {
    const set: Record<string, unknown> = {};
    const unset: Record<string, ''> = {};
    if (input.available !== undefined) set.available = !!input.available;
    if (input.availability === null) unset.availability = '';
    else if (input.availability) {
      const { days, from, to } = input.availability;
      const d = (days ?? [])
        .map(Number)
        .filter((x) => Number.isInteger(x) && x >= 0 && x <= 6);
      const f = Number(from ?? 0);
      const t = Number(to ?? 24);
      if (!(f >= 0 && f <= 23 && t >= 1 && t <= 24 && f !== t))
        throw new BadRequestException('El horario no es válido.');
      set.availability = { days: [...new Set(d)].sort(), from: f, to: t };
    }
    await this.users
      .updateOne(
        { _id: new Types.ObjectId(userId) },
        {
          ...(Object.keys(set).length ? { $set: set } : {}),
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
        },
      )
      .exec();
    return this.availability(userId);
  }

  private async owned(tenantId: string, id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Regla no encontrada');
    const r = await this.rules
      .findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
      })
      .exec();
    if (!r) throw new NotFoundException('Regla no encontrada');
    return r;
  }

  private async validate(tenantId: string, input: RoutingRuleInput) {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('Ponle un nombre a la regla.');
    const appliesTo = input.appliesTo ?? 'leads';
    if (!ROUTING_TARGETS.includes(appliesTo))
      throw new BadRequestException('Elige a qué se aplica.');
    const mode = input.mode ?? 'round_robin';
    if (!ROUTING_MODES.includes(mode))
      throw new BadRequestException('Modo de reparto no válido.');
    const kind = input.match?.kind ?? 'any';
    if (!MATCH_KINDS.includes(kind))
      throw new BadRequestException('Origen no válido.');
    const value = input.match?.value?.trim();
    if (kind !== 'any' && !value)
      throw new BadRequestException('Indica el origen de la regla.');
    const ids = [...new Set((input.members ?? []).map((m) => m.userId))].filter(
      (id) => Types.ObjectId.isValid(id),
    );
    if (!ids.length)
      throw new BadRequestException('Añade al menos un vendedor al grupo.');
    const valid = await this.users
      .find({
        _id: { $in: ids.map((i) => new Types.ObjectId(i)) },
        tenantId: new Types.ObjectId(tenantId),
        isActive: { $ne: false },
        role: { $in: SELLER_ROLES },
      })
      .select('_id')
      .lean()
      .exec();
    const ok = new Set(valid.map((u) => String(u._id)));
    if (ok.size !== ids.length)
      throw new BadRequestException('Algún vendedor del grupo no es válido.');
    const weight = new Map(
      (input.members ?? []).map((m) => [m.userId, m.weight]),
    );
    const minutes = input.responseMinutes
      ? Math.round(Number(input.responseMinutes))
      : undefined;
    if (minutes !== undefined && !(minutes >= 1 && minutes <= 7 * 24 * 60))
      throw new BadRequestException(
        'El tiempo de respuesta va de 1 minuto a 7 días.',
      );
    return {
      name: name.slice(0, 120),
      active: input.active ?? true,
      appliesTo,
      match: { kind, ...(kind !== 'any' ? { value } : {}) },
      mode,
      members: ids.map((id) => ({
        userId: new Types.ObjectId(id),
        weight: Math.min(Math.max(Number(weight.get(id) ?? 1) || 1, 0.1), 100),
      })),
      responseMinutes: minutes,
      onTimeout:
        input.onTimeout === 'pool' ? ('pool' as const) : ('next' as const),
    };
  }

  // ── Reparto ────────────────────────────────────────────────────────────

  async onEvent(e: AutomationEvent): Promise<void> {
    if (e.type === 'lead_created' && e.unassigned)
      await this.assignLead(e.tenantId, e.leadId);
    else if (e.type === 'contact_created')
      await this.assignContact(e.tenantId, e.customerId, e.formId);
  }

  /** Oportunidad nueva sin responsable: al dueño del contacto o por regla. */
  async assignLead(
    tenantId: string,
    leadId: string,
    now = this.clock(),
  ): Promise<string | null> {
    const lead = await this.leads
      .findOne({
        _id: new Types.ObjectId(leadId),
        tenantId: new Types.ObjectId(tenantId),
      })
      .exec();
    if (!lead || lead.ownerId || lead.status !== 'open') return null;
    const customer = await this.customers
      .findById(lead.customerId)
      .select('ownerId source formIds')
      .lean()
      .exec();
    if (
      customer?.ownerId &&
      (await this.isActiveUser(tenantId, String(customer.ownerId)))
    ) {
      await this.giveLead(lead, String(customer.ownerId), {
        reason: 'owner',
        now,
        detail: 'Es el responsable del contacto',
      });
      return String(customer.ownerId);
    }
    const rule = await this.ruleFor(tenantId, 'leads', {
      contactSource: customer?.source,
      formIds: customer?.formIds?.map(String),
      leadSource: lead.source,
    });
    if (!rule) return null;
    const userId = await this.choose(rule, now);
    if (!userId) {
      await this.record({
        tenantId,
        rule,
        leadId: lead._id,
        reason: 'no_one',
        now,
        detail: 'Nadie del grupo está disponible: queda en la bolsa',
      });
      return null;
    }
    await this.giveLead(lead, userId, { reason: 'auto', rule, now });
    return userId;
  }

  /** Contacto nuevo sin responsable. */
  async assignContact(
    tenantId: string,
    customerId: string,
    formId?: string,
    now = this.clock(),
  ): Promise<string | null> {
    const c = await this.customers
      .findOne({
        _id: new Types.ObjectId(customerId),
        tenantId: new Types.ObjectId(tenantId),
      })
      .exec();
    if (!c || c.ownerId) return null;
    const rule = await this.ruleFor(tenantId, 'contacts', {
      contactSource: c.source,
      formIds: formId ? [formId] : c.formIds?.map(String),
    });
    if (!rule) return null;
    const userId = await this.choose(rule, now);
    if (!userId) {
      await this.record({
        tenantId,
        rule,
        customerId: c._id,
        reason: 'no_one',
        now,
        detail: 'Nadie del grupo está disponible',
      });
      return null;
    }
    const res = await this.customers
      .updateOne(
        { _id: c._id, ownerId: null },
        { $set: { ownerId: new Types.ObjectId(userId), assignedAt: now } },
      )
      .exec();
    if (!res.modifiedCount) return null;
    const name = await this.userName(userId);
    await this.contactActivities.create({
      tenantId: c.tenantId,
      customerId: c._id,
      type: 'assignment',
      title: `Reparto automático: se asignó a ${name} (${rule.name})`,
      toUserId: new Types.ObjectId(userId),
      at: now,
    });
    await this.record({
      tenantId,
      rule,
      customerId: c._id,
      userId,
      reason: 'auto',
      now,
    });
    this.notify(
      userId,
      'Te asignaron un contacto',
      c.name,
      `/customers?customer=${String(c._id)}`,
      `contact-auto-${String(c._id)}`,
    );
    return userId;
  }

  private async ruleFor(
    tenantId: string,
    target: 'leads' | 'contacts',
    ctx: { contactSource?: string; formIds?: string[]; leadSource?: string },
  ) {
    const rules = await this.rules
      .find({
        tenantId: new Types.ObjectId(tenantId),
        active: true,
        appliesTo: { $in: [target, 'both'] },
      })
      .sort({ order: 1, createdAt: 1 })
      .exec();
    return (
      rules.find((r) => {
        const v = r.match?.value;
        switch (r.match?.kind ?? 'any') {
          case 'any':
            return true;
          case 'contact_source':
            return !!v && ctx.contactSource === v;
          case 'form':
            return !!v && (ctx.formIds ?? []).includes(v);
          case 'lead_source':
            return !!v && ctx.leadSource === v;
          default:
            return false;
        }
      }) ?? null
    );
  }

  /** Vendedor disponible según el modo; avanza el turno de forma atómica. */
  private async choose(
    rule: RoutingRule,
    now: Date,
    exclude?: string,
  ): Promise<string | null> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const fresh = await this.rules.findById(rule._id).lean().exec();
      if (!fresh) return null;
      const members = fresh.members.map((m) => String(m.userId));
      const users = await this.users
        .find({
          _id: { $in: fresh.members.map((m) => m.userId) },
          tenantId: fresh.tenantId,
          isActive: { $ne: false },
        })
        .select('available availability')
        .lean()
        .exec();
      const free = users.filter(
        (u) =>
          u.available !== false &&
          inSchedule(u.availability, now) &&
          String(u._id) !== exclude,
      );
      if (!free.length) return null;
      const ids = free.map((u) => u._id);
      const [open, received] = await Promise.all([
        fresh.mode === 'least_open'
          ? this.leads
              .aggregate<{
                _id: Types.ObjectId;
                n: number;
              }>([
                {
                  $match: {
                    tenantId: fresh.tenantId,
                    status: 'open',
                    ownerId: { $in: ids },
                  },
                },
                { $group: { _id: '$ownerId', n: { $sum: 1 } } },
              ])
              .exec()
          : Promise.resolve([]),
        fresh.mode === 'weighted'
          ? this.assignments
              .aggregate<{
                _id: Types.ObjectId;
                n: number;
              }>([
                {
                  $match: {
                    ruleId: fresh._id,
                    userId: { $in: ids },
                    reason: { $in: ['auto', 'timeout_next'] },
                  },
                },
                { $group: { _id: '$userId', n: { $sum: 1 } } },
              ])
              .exec()
          : Promise.resolve([]),
      ]);
      const openBy = new Map(open.map((o) => [String(o._id), o.n]));
      const recBy = new Map(received.map((o) => [String(o._id), o.n]));
      const available = new Map<string, Candidate>(
        free.map((u) => {
          const id = String(u._id);
          const weight =
            fresh.members.find((m) => String(m.userId) === id)?.weight ?? 1;
          return [
            id,
            {
              userId: id,
              weight,
              open: openBy.get(id) ?? 0,
              received: recBy.get(id) ?? 0,
            },
          ];
        }),
      );
      const idx = pick(fresh.mode, members, available, fresh.cursor);
      if (idx < 0) return null;
      if (fresh.mode !== 'round_robin') return members[idx];
      const moved = await this.rules
        .updateOne(
          { _id: fresh._id, cursor: fresh.cursor },
          { $set: { cursor: idx } },
        )
        .exec();
      if (moved.modifiedCount === 1) return members[idx];
    }
    return null;
  }

  private async giveLead(
    lead: Lead,
    userId: string,
    o: {
      reason: AssignmentReason;
      rule?: RoutingRule;
      now: Date;
      detail?: string;
      from?: string;
    },
  ) {
    const uid = new Types.ObjectId(userId);
    const res = await this.leads
      .updateOne(
        {
          _id: lead._id,
          ...(o.from
            ? { ownerId: new Types.ObjectId(o.from) }
            : { ownerId: null }),
        },
        {
          $set: { ownerId: uid, assignedAt: o.now },
          $unset: { assignedBy: '' },
        },
      )
      .exec();
    if (!res.modifiedCount) return;
    const name = await this.userName(userId);
    const why =
      o.reason === 'owner'
        ? `se asignó a ${name}, responsable del contacto`
        : o.reason === 'timeout_next'
          ? `${o.from ? (await this.userName(o.from)) + ' no respondió a tiempo; ' : ''}pasó a ${name}`
          : `se asignó a ${name}${o.rule ? ` (${o.rule.name})` : ''}`;
    await this.leadActivities.create({
      tenantId: lead.tenantId,
      leadId: lead._id,
      type: 'assignment',
      title: `Reparto automático: ${why}`,
      at: o.now,
    });
    const minutes = o.rule?.responseMinutes;
    await this.record({
      tenantId: String(lead.tenantId),
      rule: o.rule,
      leadId: lead._id,
      userId,
      fromUserId: o.from,
      reason: o.reason,
      now: o.now,
      detail: o.detail,
      dueAt: minutes ? new Date(o.now.getTime() + minutes * 60_000) : undefined,
    });
    this.notify(
      userId,
      o.reason === 'timeout_next'
        ? 'Te pasaron una oportunidad'
        : 'Te asignaron una oportunidad',
      minutes ? `${lead.title} · responde en ${minutes} min` : lead.title,
      `/leads?lead=${String(lead._id)}`,
      `lead-auto-${String(lead._id)}`,
    );
  }

  private async record(p: {
    tenantId: string;
    rule?: RoutingRule;
    leadId?: Types.ObjectId;
    customerId?: Types.ObjectId;
    userId?: string;
    fromUserId?: string;
    reason: AssignmentReason;
    now: Date;
    detail?: string;
    dueAt?: Date;
  }) {
    await this.assignments.create({
      tenantId: new Types.ObjectId(p.tenantId),
      ruleId: p.rule?._id,
      leadId: p.leadId,
      customerId: p.customerId,
      userId: p.userId ? new Types.ObjectId(p.userId) : undefined,
      fromUserId: p.fromUserId ? new Types.ObjectId(p.fromUserId) : undefined,
      reason: p.reason,
      at: p.now,
      status: p.dueAt ? 'pending' : 'none',
      dueAt: p.dueAt,
      detail: p.detail,
    });
  }

  // ── Tiempo de respuesta ────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      await this.checkTimeouts();
    } catch (err) {
      this.logger.error(`Tiempos de respuesta: ${String(err)}`);
    } finally {
      this.sweeping = false;
    }
  }

  /** Oportunidades sin respuesta a tiempo: al siguiente o a la bolsa. */
  async checkTimeouts(now = this.clock()): Promise<number> {
    let moved = 0;
    const due = await this.assignments
      .find({ status: 'pending', dueAt: { $lte: now } })
      .limit(200)
      .exec();
    for (const a of due) {
      // Se marca primero: dos réplicas no la reparten dos veces.
      const claimed = await this.assignments
        .updateOne(
          { _id: a._id, status: 'pending' },
          { $set: { status: 'expired' } },
        )
        .exec();
      if (!claimed.modifiedCount || !a.leadId || !a.userId) continue;
      const lead = await this.leads.findById(a.leadId).exec();
      const owner = String(a.userId);
      if (
        !lead ||
        lead.status !== 'open' ||
        String(lead.ownerId ?? '') !== owner
      ) {
        await this.assignments
          .updateOne({ _id: a._id }, { $set: { status: 'answered' } })
          .exec();
        continue;
      }
      const answered = await this.leadActivities.exists({
        leadId: lead._id,
        createdBy: a.userId,
        at: { $gt: a.at },
      });
      if (answered) {
        await this.assignments
          .updateOne({ _id: a._id }, { $set: { status: 'answered' } })
          .exec();
        continue;
      }
      const rule = a.ruleId ? await this.rules.findById(a.ruleId).exec() : null;
      const next =
        rule && rule.onTimeout === 'next'
          ? await this.choose(rule, now, owner)
          : null;
      if (next) {
        await this.giveLead(lead, next, {
          reason: 'timeout_next',
          rule: rule ?? undefined,
          now,
          from: owner,
        });
      } else {
        const res = await this.leads
          .updateOne(
            { _id: lead._id, ownerId: a.userId },
            { $unset: { ownerId: '', assignedAt: '', assignedBy: '' } },
          )
          .exec();
        if (!res.modifiedCount) continue;
        const name = await this.userName(owner);
        await this.leadActivities.create({
          tenantId: lead.tenantId,
          leadId: lead._id,
          type: 'assignment',
          title: `Reparto automático: ${name} no respondió a tiempo; vuelve a la bolsa`,
          at: now,
        });
        await this.record({
          tenantId: String(lead.tenantId),
          rule: rule ?? undefined,
          leadId: lead._id,
          fromUserId: owner,
          reason: 'timeout_pool',
          now,
          detail:
            rule?.onTimeout === 'next' ? 'Nadie más disponible' : undefined,
        });
      }
      this.notify(
        owner,
        'Se te pasó el tiempo de respuesta',
        `${lead.title} ya no está a tu cargo`,
        `/leads?lead=${String(lead._id)}`,
        `lead-timeout-${String(lead._id)}`,
      );
      moved++;
    }
    return moved;
  }

  // ── Utilidades ─────────────────────────────────────────────────────────

  private async isActiveUser(tenantId: string, userId: string) {
    return !!(await this.users.exists({
      _id: new Types.ObjectId(userId),
      tenantId: new Types.ObjectId(tenantId),
      isActive: { $ne: false },
    }));
  }

  private async userName(userId: string) {
    const u = await this.users
      .findById(userId)
      .select('name email')
      .lean()
      .exec();
    return u?.name || u?.email || 'un vendedor';
  }

  private notify(
    userId: string,
    title: string,
    body: string,
    url: string,
    tag: string,
  ) {
    void Promise.allSettled([
      this.push.sendToUser(userId, {
        title,
        body,
        url,
        tag,
        category: 'leads',
      }),
      this.nativePush.sendToUser(userId, {
        title,
        body,
        tag: tag.replace(/-/g, '_'),
        category: 'leads',
        data: { route: url },
      }),
    ]).then((rs) => {
      for (const r of rs)
        if (r.status === 'rejected')
          this.logger.warn(`Aviso de reparto no enviado: ${String(r.reason)}`);
    });
  }
}
