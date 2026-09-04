import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type QueryFilter } from 'mongoose';
import { Lead } from './lead.schema';
import { LeadActivity } from './lead-activity.schema';
import { Customer } from '../customers/customer.schema';
import { User } from '../users/user.schema';
import {
  CreateActivityDto,
  CreateLeadDto,
  MoveLeadDto,
  UpdateActivityDto,
  UpdateLeadDto,
} from './dto/lead.dto';
import {
  AUTO_ACTIVITY_TYPES,
  DEFAULT_LEAD_STAGE,
  LEAD_STAGES,
  LeadActivityType,
  stageLabel,
  statusForStage,
} from './lead-stages.catalog';
import { isOwnerScoped } from '../auth/permissions';
import { formatPhone, phoneDigits } from '../shared/phone';

/** Columna del tablero: la etapa, sus oportunidades y sus totales. */
export interface BoardColumn {
  stage: string;
  label: string;
  color: string;
  count: number;
  value: number;
  leads: Lead[];
}

/** Indicadores de la cabecera del módulo. */
export interface LeadStats {
  open: number;
  openValue: number;
  weightedValue: number;
  wonThisMonth: number;
  wonValueThisMonth: number;
  lostThisMonth: number;
  conversionRate: number;
  overdueTasks: number;
  dueTodayTasks: number;
}

export interface LeadFilters {
  stage?: string;
  status?: string;
  ownerId?: string;
  q?: string;
  tag?: string;
  /** Solo las que tienen una tarea vencida. */
  overdue?: boolean;
}

/** Datos mínimos para dar de alta un contacto junto con la oportunidad. */
export interface QuickCustomer {
  name: string;
  email?: string;
  phone?: string;
  source?: string;
}

@Injectable()
export class LeadsService {
  constructor(
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
    @InjectModel(LeadActivity.name)
    private activityModel: Model<LeadActivity>,
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  // ------------------------------------------------------------------
  // Consulta
  // ------------------------------------------------------------------

  stages() {
    return LEAD_STAGES;
  }

  /**
   * Filtro base del tenant. Los roles acotados al dueño (impulsadores) solo ven
   * lo que tienen asignado o lo que crearon.
   */
  private scope(
    tenantId: string,
    userId: string,
    role: string,
  ): QueryFilter<Lead> {
    const filter: QueryFilter<Lead> = {
      tenantId: new Types.ObjectId(tenantId),
    };
    if (isOwnerScoped(role)) {
      const uid = new Types.ObjectId(userId);
      filter.$or = [{ ownerId: uid }, { createdBy: uid }];
    }
    return filter;
  }

  private async applyFilters(
    base: QueryFilter<Lead>,
    filters: LeadFilters,
  ): Promise<QueryFilter<Lead>> {
    const query: QueryFilter<Lead> = { ...base };
    if (filters.stage) query.stage = filters.stage;
    if (filters.status) query.status = filters.status;
    if (filters.tag) query.tags = filters.tag;
    if (filters.ownerId && Types.ObjectId.isValid(filters.ownerId))
      query.ownerId = new Types.ObjectId(filters.ownerId);
    if (filters.overdue) query.nextActionAt = { $lt: new Date() };
    if (filters.q?.trim()) {
      const rx = new RegExp(
        filters.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      // El texto busca en la oportunidad y también en el contacto, que es como
      // la gente la recuerda ("el lead de Ana"), no por el título.
      const customers = await this.customerModel
        .find(
          {
            tenantId: base.tenantId,
            $or: [{ name: rx }, { phone: rx }, { email: rx }],
          },
          { _id: 1 },
        )
        .limit(200)
        .exec();
      const byCustomer = customers.map((c) => c._id);
      const text: QueryFilter<Lead>[] = [{ title: rx }, { description: rx }];
      if (byCustomer.length) text.push({ customerId: { $in: byCustomer } });
      // `$and` para no pisar el `$or` del ámbito por dueño.
      query.$and = [
        ...((query.$and as QueryFilter<Lead>[]) ?? []),
        { $or: text },
      ];
    }
    return query;
  }

  private populated(query: ReturnType<Model<Lead>['find']>) {
    return query
      .populate('customerId', 'name email phone tags')
      .populate('ownerId', 'name email');
  }

  async list(
    tenantId: string,
    userId: string,
    role: string,
    filters: LeadFilters = {},
  ): Promise<Lead[]> {
    const query = await this.applyFilters(
      this.scope(tenantId, userId, role),
      filters,
    );
    return this.populated(this.leadModel.find(query))
      .sort({ lastActivityAt: -1 })
      .limit(500)
      .exec();
  }

  /** Tablero completo: una columna por etapa, con sus totales. */
  async board(
    tenantId: string,
    userId: string,
    role: string,
    filters: LeadFilters = {},
  ): Promise<BoardColumn[]> {
    const query = await this.applyFilters(
      this.scope(tenantId, userId, role),
      filters,
    );
    const leads = await this.populated(this.leadModel.find(query))
      .sort({ position: 1, lastActivityAt: -1 })
      .limit(1000)
      .exec();

    return LEAD_STAGES.map((stage) => {
      const items = leads.filter((l) => l.stage === stage.key);
      return {
        stage: stage.key,
        label: stage.label,
        color: stage.color,
        count: items.length,
        value: items.reduce((sum, l) => sum + (l.value || 0), 0),
        leads: items,
      };
    });
  }

  async stats(
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<LeadStats> {
    const base = this.scope(tenantId, userId, role);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const now = new Date();

    const [open, wonMonth, lostMonth, wonEver, lostEver, tasks] =
      await Promise.all([
        this.leadModel.find({ ...base, status: 'open' }).exec(),
        this.leadModel
          .find({ ...base, status: 'won', closedAt: { $gte: monthStart } })
          .exec(),
        this.leadModel
          .countDocuments({
            ...base,
            status: 'lost',
            closedAt: { $gte: monthStart },
          })
          .exec(),
        this.leadModel.countDocuments({ ...base, status: 'won' }).exec(),
        this.leadModel.countDocuments({ ...base, status: 'lost' }).exec(),
        this.leadModel
          .find({ ...base, status: 'open', nextActionAt: { $ne: null } })
          .select({ nextActionAt: 1 })
          .exec(),
      ]);

    const closed = wonEver + lostEver;
    return {
      open: open.length,
      openValue: open.reduce((sum, l) => sum + (l.value || 0), 0),
      weightedValue: Math.round(
        open.reduce(
          (sum, l) =>
            sum +
            ((l.value || 0) *
              (LEAD_STAGES.find((s) => s.key === l.stage)?.probability ?? 0)) /
              100,
          0,
        ),
      ),
      wonThisMonth: wonMonth.length,
      wonValueThisMonth: wonMonth.reduce((sum, l) => sum + (l.value || 0), 0),
      lostThisMonth: lostMonth,
      conversionRate: closed ? Math.round((wonEver / closed) * 100) : 0,
      overdueTasks: tasks.filter((l) => l.nextActionAt && l.nextActionAt < now)
        .length,
      dueTodayTasks: tasks.filter(
        (l) =>
          l.nextActionAt &&
          l.nextActionAt >= now &&
          l.nextActionAt <= endOfToday,
      ).length,
    };
  }

  async findOne(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<Lead> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Oportunidad no encontrada');
    const lead = await this.populated(
      this.leadModel.find({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
      }),
    )
      .limit(1)
      .exec()
      .then((rows) => rows[0]);
    if (!lead) throw new NotFoundException('Oportunidad no encontrada');
    this.assertOwnership(lead, userId, role);
    return lead;
  }

  private assertOwnership(lead: Lead, userId: string, role: string) {
    if (!isOwnerScoped(role)) return;
    const mine =
      String(lead.ownerId ?? '') === userId ||
      String(lead.createdBy ?? '') === userId;
    if (!mine) throw new ForbiddenException('Esta oportunidad no es tuya');
  }

  /** Responsables posibles del seguimiento (para el selector). */
  async owners(tenantId: string) {
    const users = await this.userModel
      .find(
        { tenantId: new Types.ObjectId(tenantId), isActive: true },
        { name: 1, email: 1, role: 1 },
      )
      .sort({ name: 1, email: 1 })
      .exec();
    return users.map((u) => ({
      _id: String(u._id),
      name: u.name || u.email,
      email: u.email,
      role: u.role,
    }));
  }

  // ------------------------------------------------------------------
  // Escritura
  // ------------------------------------------------------------------

  async create(
    tenantId: string,
    userId: string,
    role: string,
    dto: CreateLeadDto,
  ): Promise<Lead> {
    const customerId = await this.resolveCustomer(tenantId, userId, role, dto);
    const stage = dto.stage ?? DEFAULT_LEAD_STAGE;
    const status = statusForStage(stage);

    const lead = await this.leadModel.create({
      tenantId: new Types.ObjectId(tenantId),
      customerId,
      title: dto.title.trim(),
      description: dto.description,
      stage,
      status,
      value: dto.value ?? 0,
      currency: dto.currency || 'PEN',
      priority: dto.priority ?? 'medium',
      ownerId: dto.ownerId
        ? new Types.ObjectId(dto.ownerId)
        : new Types.ObjectId(userId),
      source: dto.source || 'manual',
      conversationId: dto.conversationId
        ? new Types.ObjectId(dto.conversationId)
        : undefined,
      tags: dto.tags ?? [],
      expectedCloseDate: dto.expectedCloseDate
        ? new Date(dto.expectedCloseDate)
        : undefined,
      closedAt: status === 'open' ? undefined : new Date(),
      lastActivityAt: new Date(),
      // Al frente de su columna: lo nuevo es lo que hay que atender.
      position: await this.nextPosition(tenantId, stage),
      createdBy: new Types.ObjectId(userId),
    });

    await this.log(lead, 'system', 'Oportunidad creada', userId);
    return this.findOne(String(lead._id), tenantId, userId, role);
  }

  /** Usa el contacto indicado o crea/reutiliza uno con los datos rápidos. */
  private async resolveCustomer(
    tenantId: string,
    userId: string,
    role: string,
    dto: CreateLeadDto,
  ): Promise<Types.ObjectId> {
    if (dto.customerId) {
      if (!Types.ObjectId.isValid(dto.customerId))
        throw new BadRequestException('Contacto inválido');
      const customer = await this.customerModel
        .findOne({
          _id: new Types.ObjectId(dto.customerId),
          tenantId: new Types.ObjectId(tenantId),
        })
        .exec();
      if (!customer) throw new NotFoundException('Contacto no encontrado');
      return customer._id;
    }
    if (!dto.customer?.name?.trim())
      throw new BadRequestException(
        'Indica un contacto existente o el nombre de uno nuevo',
      );
    const customer = await this.upsertCustomer(tenantId, userId, role, {
      ...dto.customer,
      source: dto.source,
    });
    return customer._id;
  }

  /**
   * Busca el contacto por teléfono o email dentro del tenant y lo crea si no
   * existe. Es el mismo criterio que usa el alta desde la bandeja de entrada:
   * la misma persona no puede acabar duplicada por escribir desde dos sitios.
   */
  async upsertCustomer(
    tenantId: string,
    userId: string,
    role: string,
    data: QuickCustomer,
  ): Promise<Customer> {
    const tid = new Types.ObjectId(tenantId);
    const phone = formatPhone(data.phone);
    const digits = phoneDigits(data.phone);
    const email = data.email?.toLowerCase().trim() || undefined;

    const or: QueryFilter<Customer>[] = [];
    // El teléfono guardado lleva espacios; se compara por dígitos.
    if (digits) or.push({ phone: this.phoneRegex(digits) });
    if (email) or.push({ email });

    const existing = or.length
      ? await this.customerModel.findOne({ tenantId: tid, $or: or }).exec()
      : null;

    if (existing) {
      let touched = false;
      if (!existing.phone && phone) {
        existing.phone = phone;
        touched = true;
      }
      if (!existing.email && email) {
        existing.email = email;
        touched = true;
      }
      if (touched) await existing.save();
      return existing;
    }

    return this.customerModel.create({
      tenantId: tid,
      name: data.name.trim(),
      email,
      phone,
      tags: [],
      source: data.source || 'manual',
      ...(isOwnerScoped(role) ? { createdBy: new Types.ObjectId(userId) } : {}),
    });
  }

  /** Compara teléfonos ignorando los espacios del formato de almacenamiento. */
  private phoneRegex(digits: string): RegExp {
    return new RegExp(`^\\+?\\s*${digits.split('').join('\\s*')}$`);
  }

  private async nextPosition(tenantId: string, stage: string): Promise<number> {
    const top = await this.leadModel
      .findOne({ tenantId: new Types.ObjectId(tenantId), stage })
      .sort({ position: 1 })
      .select({ position: 1 })
      .exec();
    return (top?.position ?? 0) - 1;
  }

  async update(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
    dto: UpdateLeadDto,
  ): Promise<Lead> {
    const lead = await this.findOne(id, tenantId, userId, role);
    const previousStage = lead.stage;

    if (dto.title !== undefined) lead.title = dto.title.trim();
    if (dto.description !== undefined) lead.description = dto.description;
    if (dto.value !== undefined) lead.value = dto.value;
    if (dto.currency !== undefined) lead.currency = dto.currency;
    if (dto.priority !== undefined) lead.priority = dto.priority;
    if (dto.tags !== undefined) lead.tags = dto.tags;
    if (dto.source !== undefined) lead.source = dto.source;
    if (dto.lostReason !== undefined) lead.lostReason = dto.lostReason;
    if (dto.ownerId !== undefined)
      lead.ownerId = dto.ownerId ? new Types.ObjectId(dto.ownerId) : undefined;
    if (dto.customerId !== undefined && dto.customerId)
      lead.customerId = new Types.ObjectId(dto.customerId);
    if (dto.expectedCloseDate !== undefined)
      lead.expectedCloseDate = dto.expectedCloseDate
        ? new Date(dto.expectedCloseDate)
        : undefined;
    if (dto.stage !== undefined && dto.stage !== previousStage)
      this.applyStage(lead, dto.stage);

    lead.lastActivityAt = new Date();
    await lead.save();

    if (dto.stage !== undefined && dto.stage !== previousStage)
      await this.log(
        lead,
        'stage_change',
        `Etapa: ${stageLabel(previousStage)} → ${stageLabel(lead.stage)}`,
        userId,
      );

    return this.findOne(id, tenantId, userId, role);
  }

  /** Mueve la oportunidad de columna y la coloca en la posición indicada. */
  async move(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
    dto: MoveLeadDto,
  ): Promise<Lead> {
    const lead = await this.findOne(id, tenantId, userId, role);
    const previousStage = lead.stage;
    if (dto.lostReason !== undefined) lead.lostReason = dto.lostReason;
    this.applyStage(lead, dto.stage);
    lead.position = await this.positionFor(
      tenantId,
      dto.stage,
      dto.position,
      String(lead._id),
    );
    lead.lastActivityAt = new Date();
    await lead.save();

    if (previousStage !== dto.stage) {
      const reason = lead.lostReason ? ` — ${lead.lostReason}` : '';
      await this.log(
        lead,
        'stage_change',
        `Etapa: ${stageLabel(previousStage)} → ${stageLabel(dto.stage)}${reason}`,
        userId,
      );
    }
    return this.findOne(id, tenantId, userId, role);
  }

  /** Etapa, estado y fecha de cierre van siempre juntos. */
  private applyStage(lead: Lead, stage: string) {
    lead.stage = stage;
    lead.status = statusForStage(stage);
    lead.closedAt = lead.status === 'open' ? undefined : new Date();
    if (lead.status !== 'lost') lead.lostReason = undefined;
  }

  /**
   * Posición dentro de la columna destino. Sin índice, va al principio; con
   * índice, se intercala entre sus vecinos para no reordenar toda la columna.
   */
  private async positionFor(
    tenantId: string,
    stage: string,
    index: number | undefined,
    excludeId: string,
  ): Promise<number> {
    const siblings = await this.leadModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        stage,
        _id: { $ne: new Types.ObjectId(excludeId) },
      })
      .sort({ position: 1 })
      .select({ position: 1 })
      .exec();
    if (index === undefined || siblings.length === 0)
      return (siblings[0]?.position ?? 0) - 1;
    if (index <= 0) return siblings[0].position - 1;
    if (index >= siblings.length)
      return siblings[siblings.length - 1].position + 1;
    const before = siblings[index - 1].position;
    const after = siblings[index].position;
    return (before + after) / 2;
  }

  async remove(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<{ deleted: boolean }> {
    const lead = await this.findOne(id, tenantId, userId, role);
    await this.activityModel.deleteMany({ leadId: lead._id }).exec();
    await this.leadModel.deleteOne({ _id: lead._id }).exec();
    return { deleted: true };
  }

  // ------------------------------------------------------------------
  // Actividades y tareas
  // ------------------------------------------------------------------

  async listActivities(
    leadId: string,
    tenantId: string,
    userId: string,
    role: string,
  ) {
    await this.findOne(leadId, tenantId, userId, role);
    return this.activityModel
      .find({ leadId: new Types.ObjectId(leadId) })
      .populate('createdBy', 'name email')
      .sort({ at: -1 })
      .limit(200)
      .exec();
  }

  async addActivity(
    leadId: string,
    tenantId: string,
    userId: string,
    role: string,
    dto: CreateActivityDto,
  ) {
    const lead = await this.findOne(leadId, tenantId, userId, role);
    if (AUTO_ACTIVITY_TYPES.includes(dto.type as LeadActivityType))
      throw new BadRequestException(
        'Ese tipo de actividad lo registra la plataforma automáticamente',
      );
    const activity = await this.activityModel.create({
      tenantId: lead.tenantId,
      leadId: lead._id,
      type: dto.type,
      title: dto.title.trim(),
      body: dto.body,
      at: dto.at ? new Date(dto.at) : new Date(),
      dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      done: false,
      createdBy: new Types.ObjectId(userId),
    });
    lead.lastActivityAt = new Date();
    await lead.save();
    await this.refreshNextAction(String(lead._id));
    return activity;
  }

  async updateActivity(
    leadId: string,
    activityId: string,
    tenantId: string,
    userId: string,
    role: string,
    dto: UpdateActivityDto,
  ) {
    await this.findOne(leadId, tenantId, userId, role);
    const activity = await this.activityModel
      .findOne({
        _id: new Types.ObjectId(activityId),
        leadId: new Types.ObjectId(leadId),
      })
      .exec();
    if (!activity) throw new NotFoundException('Actividad no encontrada');
    if (dto.title !== undefined) activity.title = dto.title.trim();
    if (dto.body !== undefined) activity.body = dto.body;
    if (dto.dueAt !== undefined)
      activity.dueAt = dto.dueAt ? new Date(dto.dueAt) : undefined;
    if (dto.done !== undefined) {
      activity.done = dto.done;
      activity.doneAt = dto.done ? new Date() : undefined;
    }
    await activity.save();
    await this.refreshNextAction(leadId);
    return activity;
  }

  async removeActivity(
    leadId: string,
    activityId: string,
    tenantId: string,
    userId: string,
    role: string,
  ) {
    await this.findOne(leadId, tenantId, userId, role);
    await this.activityModel
      .deleteOne({
        _id: new Types.ObjectId(activityId),
        leadId: new Types.ObjectId(leadId),
      })
      .exec();
    await this.refreshNextAction(leadId);
    return { deleted: true };
  }

  /** Tareas pendientes del usuario (agenda del módulo). */
  async agenda(tenantId: string, userId: string, role: string) {
    const leads = await this.leadModel
      .find({ ...this.scope(tenantId, userId, role), status: 'open' })
      .select({ _id: 1, title: 1, customerId: 1 })
      .populate('customerId', 'name')
      .exec();
    if (leads.length === 0) return [];
    const byId = new Map(leads.map((l) => [String(l._id), l]));
    const tasks = await this.activityModel
      .find({
        leadId: { $in: leads.map((l) => l._id) },
        type: 'task',
        done: false,
        dueAt: { $ne: null },
      })
      .sort({ dueAt: 1 })
      .limit(50)
      .exec();
    return tasks.map((t) => {
      const lead = byId.get(String(t.leadId));
      return {
        _id: String(t._id),
        title: t.title,
        dueAt: t.dueAt,
        leadId: String(t.leadId),
        leadTitle: lead?.title ?? '',
        customer: lead?.customerId,
      };
    });
  }

  /**
   * Recalcula el próximo paso del lead a partir de sus tareas pendientes. Se
   * guarda en el propio lead para que el tablero pueda mostrarlo y filtrarlo
   * sin consultar las actividades de cada tarjeta.
   */
  private async refreshNextAction(leadId: string) {
    const next = await this.activityModel
      .findOne({
        leadId: new Types.ObjectId(leadId),
        type: 'task',
        done: false,
        dueAt: { $ne: null },
      })
      .sort({ dueAt: 1 })
      .exec();
    await this.leadModel
      .updateOne(
        { _id: new Types.ObjectId(leadId) },
        {
          $set: {
            nextActionAt: next?.dueAt ?? null,
            nextActionTitle: next?.title ?? null,
          },
        },
      )
      .exec();
  }

  /** Actividad registrada por la plataforma (creación, cambio de etapa…). */
  private async log(
    lead: Lead,
    type: LeadActivityType,
    title: string,
    userId?: string,
  ) {
    await this.activityModel.create({
      tenantId: lead.tenantId,
      leadId: lead._id,
      type,
      title,
      at: new Date(),
      createdBy: userId ? new Types.ObjectId(userId) : undefined,
    });
  }

  // ------------------------------------------------------------------
  // Integración con la bandeja de entrada
  // ------------------------------------------------------------------

  /**
   * Busca contactos para el selector del alta. Vive aquí y no en el módulo de
   * clientes porque quien lleva el seguimiento no tiene por qué tener acceso a
   * la pantalla de contactos.
   */
  async searchCustomers(tenantId: string, q: string) {
    const filter: QueryFilter<Customer> = {
      tenantId: new Types.ObjectId(tenantId),
    };
    if (q?.trim()) {
      const rx = new RegExp(
        q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }
    const rows = await this.customerModel
      .find(filter, { name: 1, email: 1, phone: 1 })
      .sort({ name: 1 })
      .limit(20)
      .exec();
    return rows.map((c) => ({
      _id: String(c._id),
      name: c.name,
      email: c.email,
      phone: c.phone,
    }));
  }

  /** Contacto del tenant por id; null si no existe o es de otra empresa. */
  async findCustomer(
    customerId: string,
    tenantId: string,
  ): Promise<Customer | null> {
    if (!Types.ObjectId.isValid(customerId)) return null;
    return this.customerModel
      .findOne({
        _id: new Types.ObjectId(customerId),
        tenantId: new Types.ObjectId(tenantId),
      })
      .exec();
  }

  /**
   * Etiquetas ya usadas en los contactos del tenant. La bandeja las ofrece al
   * clasificar un chat para que el equipo reutilice las suyas en vez de
   * inventar una variante nueva de la misma ("VIP", "vip", "V.I.P.").
   */
  async customerTags(tenantId: string): Promise<string[]> {
    const tags = await this.customerModel.distinct('tags', {
      tenantId: new Types.ObjectId(tenantId),
    });
    return tags
      .filter((t) => typeof t === 'string' && t.trim())
      .sort((a, b) => a.localeCompare(b, 'es'));
  }

  /**
   * Etiquetas de varios contactos de una sola consulta, indexadas por id.
   * La usa la bandeja para pintar la clasificación en la lista de chats sin
   * hacer una consulta por conversación.
   */
  async tagsByCustomer(
    tenantId: string,
    customerIds: string[],
  ): Promise<Map<string, string[]>> {
    const ids = customerIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    if (ids.length === 0) return new Map();

    const rows = await this.customerModel
      .find(
        { _id: { $in: ids }, tenantId: new Types.ObjectId(tenantId) },
        { tags: 1 },
      )
      .lean()
      .exec();
    return new Map(rows.map((r) => [String(r._id), r.tags ?? []]));
  }

  /** Oportunidades de un contacto, para mostrarlas en su ficha o en el chat. */
  async findByCustomer(customerId: string, tenantId: string): Promise<Lead[]> {
    if (!Types.ObjectId.isValid(customerId)) return [];
    return this.leadModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        customerId: new Types.ObjectId(customerId),
      })
      .sort({ lastActivityAt: -1 })
      .exec();
  }
}
