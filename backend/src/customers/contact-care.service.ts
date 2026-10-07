import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer } from './customer.schema';
import {
  ContactActivity,
  CONTACT_AUTO_ACTIVITY_TYPES,
} from './contact-activity.schema';
import { User } from '../users/user.schema';
import { Lead } from '../leads/lead.schema';
import { LeadActivity } from '../leads/lead-activity.schema';
import { RolesService } from '../roles/roles.service';
import { isLeadSupervisor, isOwnerScoped } from '../auth/permissions';
import {
  CreateContactActivityDto,
  UpdateContactActivityDto,
} from './dto/contact-care.dto';

export interface ContactOwner {
  _id: string;
  name: string;
  email: string;
  role: string;
  contacts: number;
}

interface PersonRef {
  _id: string;
  name: string;
}

export interface TimelineItem {
  _id: string;
  /** `contact`: bitácora del contacto. `lead`: historial de una oportunidad. */
  source: 'contact' | 'lead';
  type: string;
  title: string;
  body?: string;
  at: Date;
  createdBy?: PersonRef;
  fromUser?: PersonRef;
  toUser?: PersonRef;
  leadId?: string;
  leadTitle?: string;
  /** Si quien consulta puede editarla o borrarla. */
  editable: boolean;
}

type Populated = { _id: Types.ObjectId; name?: string; email?: string } | null;

const TIMELINE_LIMIT = 300;

function person(p: unknown): PersonRef | undefined {
  const u = p as Populated;
  if (!u || !u._id) return undefined;
  return { _id: String(u._id), name: u.name || u.email || 'Usuario' };
}

/**
 * Atención de un contacto: quién lo lleva (responsable) y qué se ha hecho con
 * él (bitácora). El reparto de oportunidades vive aparte, en `LeadsService`.
 */
@Injectable()
export class ContactCareService {
  constructor(
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
    @InjectModel(ContactActivity.name)
    private activityModel: Model<ContactActivity>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
    @InjectModel(LeadActivity.name)
    private leadActivityModel: Model<LeadActivity>,
    private roles: RolesService,
  ) {}

  // ------------------------------------------------------------------
  // Responsable
  // ------------------------------------------------------------------

  /** Usuarios activos cuyo rol tiene el módulo de contactos, con su carga. */
  async owners(tenantId: string): Promise<ContactOwner[]> {
    const tid = new Types.ObjectId(tenantId);
    const [users, loads] = await Promise.all([
      this.userModel
        .find({ tenantId: tid, isActive: true }, { name: 1, email: 1, role: 1 })
        .sort({ name: 1, email: 1 })
        .exec(),
      this.customerModel
        .aggregate<{
          _id: Types.ObjectId;
          count: number;
        }>([
          { $match: { tenantId: tid, ownerId: { $ne: null } } },
          { $group: { _id: '$ownerId', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);
    const allowed = new Set<string>();
    await Promise.all(
      [...new Set(users.map((u) => u.role))].map(async (r) => {
        const modules = await this.roles.modulesFor(tenantId, r);
        if (modules.includes('customers')) allowed.add(r);
      }),
    );
    const load = new Map(loads.map((l) => [String(l._id), l.count]));
    return users
      .filter((u) => allowed.has(u.role))
      .map((u) => ({
        _id: String(u._id),
        name: u.name || u.email,
        email: u.email,
        role: u.role,
        contacts: load.get(String(u._id)) ?? 0,
      }));
  }

  /** El agente se queda con un contacto que nadie lleva. Atómico. */
  async claim(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<Customer> {
    const customer = await this.load(id, tenantId, userId, role);
    const uid = new Types.ObjectId(userId);
    const updated = await this.customerModel
      .findOneAndUpdate(
        { _id: customer._id, tenantId: customer.tenantId, ownerId: null },
        { $set: { ownerId: uid, assignedAt: new Date(), assignedBy: uid } },
        { new: true },
      )
      .exec();
    if (!updated)
      throw new ConflictException('Este contacto ya tiene responsable');
    const me = await this.userName(tenantId, userId);
    await this.logAssignment(updated, `${me} tomó el contacto`, userId, {
      to: userId,
    });
    return this.withOwner(updated);
  }

  /**
   * Asigna o deriva. Un supervisor puede con cualquiera; el responsable
   * actual puede pasárselo a otra persona; y cualquiera puede asignarse a sí
   * mismo un contacto libre (equivale a `claim`).
   */
  async assign(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
    toUserId: string,
    note?: string,
  ): Promise<Customer> {
    const customer = await this.load(id, tenantId, userId, role);
    const current = customer.ownerId ? String(customer.ownerId) : '';
    if (current === toUserId)
      throw new BadRequestException('Ya es el responsable de este contacto');
    const allowed =
      isLeadSupervisor(role) ||
      current === userId ||
      (!current && toUserId === userId);
    if (!allowed)
      throw new ForbiddenException(
        'Solo el responsable o un supervisor puede derivar este contacto',
      );
    const target = await this.assertEligible(tenantId, toUserId);

    customer.ownerId = new Types.ObjectId(toUserId);
    customer.assignedAt = new Date();
    customer.assignedBy = new Types.ObjectId(userId);
    await customer.save();

    const me = await this.userName(tenantId, userId);
    const title =
      toUserId === userId
        ? `${me} se asignó el contacto`
        : current
          ? `${me} lo derivó a ${target}`
          : `${me} lo asignó a ${target}`;
    await this.logAssignment(
      customer,
      title,
      userId,
      { from: current || undefined, to: toUserId },
      note,
    );
    return this.withOwner(customer);
  }

  /** Devuelve el contacto a "sin asignar". */
  async release(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
    note?: string,
  ): Promise<Customer> {
    const customer = await this.load(id, tenantId, userId, role);
    const current = customer.ownerId ? String(customer.ownerId) : '';
    if (!current)
      throw new BadRequestException('El contacto no tiene responsable');
    if (!isLeadSupervisor(role) && current !== userId)
      throw new ForbiddenException(
        'Solo el responsable o un supervisor puede liberar este contacto',
      );
    await this.customerModel
      .updateOne(
        { _id: customer._id, tenantId: customer.tenantId },
        { $unset: { ownerId: 1, assignedAt: 1, assignedBy: 1 } },
      )
      .exec();
    const me = await this.userName(tenantId, userId);
    await this.logAssignment(
      customer,
      `${me} liberó el contacto`,
      userId,
      { from: current },
      note,
    );
    const fresh = await this.customerModel.findById(customer._id).exec();
    return this.withOwner(fresh!);
  }

  /**
   * Asignación en bloque. Un supervisor reparte a quien quiera (o deja sin
   * responsable); el resto solo puede quedarse con los que están libres.
   */
  async bulkAssign(
    tenantId: string,
    userId: string,
    role: string,
    customerIds: string[],
    toUserId?: string,
  ): Promise<{ updated: number; skipped: number }> {
    const supervisor = isLeadSupervisor(role);
    if (!supervisor && toUserId !== userId)
      throw new ForbiddenException(
        'Solo un supervisor puede repartir contactos a otras personas',
      );
    const target = toUserId
      ? await this.assertEligible(tenantId, toUserId)
      : '';
    const tid = new Types.ObjectId(tenantId);
    const filter: Record<string, unknown> = {
      tenantId: tid,
      _id: { $in: customerIds.map((c) => new Types.ObjectId(c)) },
    };
    if (isOwnerScoped(role)) filter['createdBy'] = new Types.ObjectId(userId);
    if (!supervisor) filter['ownerId'] = null;

    const customers = await this.customerModel
      .find(filter, { ownerId: 1, tenantId: 1 })
      .exec();
    const changing = customers.filter(
      (c) => (c.ownerId ? String(c.ownerId) : '') !== (toUserId ?? ''),
    );
    if (!changing.length) return { updated: 0, skipped: customerIds.length };

    const uid = new Types.ObjectId(userId);
    const now = new Date();
    await this.customerModel
      .updateMany(
        { tenantId: tid, _id: { $in: changing.map((c) => c._id) } },
        toUserId
          ? {
              $set: {
                ownerId: new Types.ObjectId(toUserId),
                assignedAt: now,
                assignedBy: uid,
              },
            }
          : { $unset: { ownerId: 1, assignedAt: 1, assignedBy: 1 } },
      )
      .exec();

    const me = await this.userName(tenantId, userId);
    const title = !toUserId
      ? `${me} liberó el contacto`
      : toUserId === userId
        ? `${me} se asignó el contacto`
        : `${me} lo asignó a ${target}`;
    await this.activityModel.insertMany(
      changing.map((c) => ({
        tenantId: tid,
        customerId: c._id,
        type: 'assignment',
        title,
        at: now,
        fromUserId: c.ownerId,
        toUserId: toUserId ? new Types.ObjectId(toUserId) : undefined,
        createdBy: uid,
      })),
    );
    return {
      updated: changing.length,
      skipped: customerIds.length - changing.length,
    };
  }

  /** Añade y/o quita etiquetas a varios contactos. */
  async bulkTags(
    tenantId: string,
    userId: string,
    role: string,
    customerIds: string[],
    add: string[] = [],
    remove: string[] = [],
  ): Promise<{ updated: number }> {
    const clean = (tags: string[]) => [
      ...new Set(tags.map((t) => t.trim()).filter(Boolean)),
    ];
    const toAdd = clean(add);
    const toRemove = clean(remove).filter((t) => !toAdd.includes(t));
    if (!toAdd.length && !toRemove.length)
      throw new BadRequestException('Indica al menos una etiqueta');
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      _id: { $in: customerIds.map((c) => new Types.ObjectId(c)) },
    };
    if (isOwnerScoped(role)) filter['createdBy'] = new Types.ObjectId(userId);

    // Dos pasadas: Mongo no admite $addToSet y $pull sobre el mismo campo.
    let updated = 0;
    if (toAdd.length) {
      const res = await this.customerModel
        .updateMany(filter, { $addToSet: { tags: { $each: toAdd } } })
        .exec();
      updated = Math.max(updated, res.matchedCount);
    }
    if (toRemove.length) {
      const res = await this.customerModel
        .updateMany(filter, { $pull: { tags: { $in: toRemove } } })
        .exec();
      updated = Math.max(updated, res.matchedCount);
    }
    return { updated };
  }

  // ------------------------------------------------------------------
  // Bitácora
  // ------------------------------------------------------------------

  /**
   * Línea de tiempo del contacto: su bitácora más el historial de todas sus
   * oportunidades, de lo más reciente a lo más antiguo.
   */
  async timeline(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<TimelineItem[]> {
    const customer = await this.load(id, tenantId, userId, role);
    const tid = customer.tenantId;
    const supervisor = isLeadSupervisor(role);

    const leads = await this.leadModel
      .find({ tenantId: tid, customerId: customer._id }, { title: 1 })
      .lean()
      .exec();
    const leadTitle = new Map(leads.map((l) => [String(l._id), l.title]));

    const [own, fromLeads] = await Promise.all([
      this.activityModel
        .find({ tenantId: tid, customerId: customer._id })
        .sort({ at: -1 })
        .limit(TIMELINE_LIMIT)
        .populate('createdBy', 'name email')
        .populate('fromUserId', 'name email')
        .populate('toUserId', 'name email')
        .lean()
        .exec(),
      leads.length
        ? this.leadActivityModel
            .find({ tenantId: tid, leadId: { $in: leads.map((l) => l._id) } })
            .sort({ at: -1 })
            .limit(TIMELINE_LIMIT)
            .populate('createdBy', 'name email')
            .lean()
            .exec()
        : Promise.resolve([]),
    ]);

    const auto = CONTACT_AUTO_ACTIVITY_TYPES as readonly string[];
    const items: TimelineItem[] = [
      ...own.map((a) => {
        const author = person(a.createdBy);
        return {
          _id: String(a._id),
          source: 'contact' as const,
          type: a.type,
          title: a.title,
          body: a.body,
          at: a.at,
          createdBy: author,
          fromUser: person(a.fromUserId),
          toUser: person(a.toUserId),
          editable:
            !auto.includes(a.type) && (supervisor || author?._id === userId),
        };
      }),
      ...fromLeads.map((a) => ({
        _id: String(a._id),
        source: 'lead' as const,
        type: a.type,
        title: a.title,
        body: a.body,
        at: a.at,
        createdBy: person(a.createdBy),
        leadId: String(a.leadId),
        leadTitle: leadTitle.get(String(a.leadId)),
        // Lo de una oportunidad se edita en la oportunidad.
        editable: false,
      })),
    ];
    return items
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, TIMELINE_LIMIT);
  }

  async addActivity(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
    dto: CreateContactActivityDto,
  ): Promise<ContactActivity> {
    const customer = await this.load(id, tenantId, userId, role);
    return this.activityModel.create({
      tenantId: customer.tenantId,
      customerId: customer._id,
      type: dto.type,
      title: dto.title.trim(),
      body: dto.body?.trim() || undefined,
      at: dto.at ? new Date(dto.at) : new Date(),
      conversationId: dto.conversationId
        ? new Types.ObjectId(dto.conversationId)
        : undefined,
      createdBy: new Types.ObjectId(userId),
    });
  }

  async updateActivity(
    id: string,
    activityId: string,
    tenantId: string,
    userId: string,
    role: string,
    dto: UpdateContactActivityDto,
  ): Promise<ContactActivity> {
    const activity = await this.loadEditable(
      id,
      activityId,
      tenantId,
      userId,
      role,
    );
    if (dto.type !== undefined) activity.type = dto.type;
    if (dto.title !== undefined) activity.title = dto.title.trim();
    if (dto.body !== undefined) activity.body = dto.body.trim() || undefined;
    if (dto.at !== undefined) activity.at = new Date(dto.at);
    return activity.save();
  }

  async deleteActivity(
    id: string,
    activityId: string,
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<void> {
    const activity = await this.loadEditable(
      id,
      activityId,
      tenantId,
      userId,
      role,
    );
    await this.activityModel.deleteOne({ _id: activity._id }).exec();
  }

  // ------------------------------------------------------------------
  // Internos
  // ------------------------------------------------------------------

  private async load(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<Customer> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('Identificador inválido');
    const customer = await this.customerModel
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .exec();
    if (!customer) throw new NotFoundException('Contacto no encontrado');
    if (isOwnerScoped(role) && customer.createdBy?.toString() !== userId)
      throw new ForbiddenException();
    return customer;
  }

  private async loadEditable(
    id: string,
    activityId: string,
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<ContactActivity> {
    const customer = await this.load(id, tenantId, userId, role);
    if (!Types.ObjectId.isValid(activityId))
      throw new BadRequestException('Identificador inválido');
    const activity = await this.activityModel
      .findOne({
        _id: activityId,
        tenantId: customer.tenantId,
        customerId: customer._id,
      })
      .exec();
    if (!activity) throw new NotFoundException('Registro no encontrado');
    if (
      (CONTACT_AUTO_ACTIVITY_TYPES as readonly string[]).includes(activity.type)
    )
      throw new ForbiddenException(
        'Los registros automáticos no se pueden modificar',
      );
    if (!isLeadSupervisor(role) && activity.createdBy?.toString() !== userId)
      throw new ForbiddenException('Solo puedes modificar tus registros');
    return activity;
  }

  /** Usuario activo del tenant o error; devuelve su nombre para el historial. */
  private async assertEligible(
    tenantId: string,
    userId: string,
  ): Promise<string> {
    if (!Types.ObjectId.isValid(userId))
      throw new BadRequestException('Usuario inválido');
    const user = await this.userModel
      .findOne(
        { _id: userId, tenantId: new Types.ObjectId(tenantId), isActive: true },
        { name: 1, email: 1 },
      )
      .exec();
    if (!user)
      throw new BadRequestException('El usuario no existe o está inactivo');
    return user.name || user.email;
  }

  private async userName(tenantId: string, userId: string): Promise<string> {
    const user = await this.userModel
      .findOne(
        { _id: userId, tenantId: new Types.ObjectId(tenantId) },
        { name: 1, email: 1 },
      )
      .exec();
    return user?.name || user?.email || 'Alguien';
  }

  private withOwner(customer: Customer): Promise<Customer> {
    return customer.populate('ownerId', 'name email');
  }

  private async logAssignment(
    customer: Customer,
    title: string,
    userId: string,
    who: { from?: string; to?: string },
    body?: string,
  ): Promise<void> {
    await this.activityModel.create({
      tenantId: customer.tenantId,
      customerId: customer._id,
      type: 'assignment',
      title,
      body: body?.trim() || undefined,
      at: new Date(),
      fromUserId: who.from ? new Types.ObjectId(who.from) : undefined,
      toUserId: who.to ? new Types.ObjectId(who.to) : undefined,
      createdBy: new Types.ObjectId(userId),
    });
  }
}
