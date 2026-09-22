import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type QueryFilter } from 'mongoose';
import { LeadsService } from '../leads/leads.service';
import { Customer } from '../customers/customer.schema';
import { ProspectSearch } from './prospect-search.schema';
import {
  Prospect,
  ProspectPerson,
  type ProspectStatus,
} from './prospect.schema';
import { ProspectingWorker } from './prospecting-worker.service';
import { ProspectingResearchService } from './prospecting-research.service';
import { domainOf, normalizeUrl } from './prospecting-sources';
import {
  ConvertToCustomerDto,
  ConvertToLeadDto,
  CreateProspectDto,
  CreateSearchDto,
  UpdateProspectDto,
} from './dto/prospecting.dto';

/** Campos pesados que la tabla no necesita: se piden solo en la ficha. */
const LIST_PROJECTION = {
  'research.website.excerpt': 0,
  'research.searchResults': 0,
  'research.place.reviews': 0,
  'material.diagnosis': 0,
  'material.plan': 0,
  'material.outreach': 0,
};

@Injectable()
export class ProspectingService {
  constructor(
    @InjectModel(ProspectSearch.name)
    private searchModel: Model<ProspectSearch>,
    @InjectModel(Prospect.name) private prospectModel: Model<Prospect>,
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
    private leads: LeadsService,
    private worker: ProspectingWorker,
    private research: ProspectingResearchService,
  ) {}

  private oid(id: string, label = 'Identificador'): Types.ObjectId {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException(`${label} inválido`);
    return new Types.ObjectId(id);
  }

  /** Qué fuentes tiene configuradas el tenant, para orientar en la pantalla. */
  async integrations(tenantId: string) {
    const keys = await this.research.keys(tenantId);
    return {
      places: !!keys.places,
      pageSpeed: !!keys.pageSpeed,
      serper: !!keys.serper,
      hunter: !!keys.hunter,
      ai: Object.values(keys.ai).some((k?: string) => !!k?.trim()),
    };
  }

  // ── Búsquedas ──────────────────────────────────────────────────────────

  async listSearches(tenantId: string) {
    const tid = this.oid(tenantId);
    const searches = await this.searchModel
      .find({ tenantId: tid })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    const counts = await this.prospectModel
      .aggregate<{
        _id: Types.ObjectId;
        total: number;
        researched: number;
        converted: number;
      }>([
        { $match: { tenantId: tid } },
        {
          $group: {
            _id: '$searchId',
            total: { $sum: 1 },
            researched: {
              $sum: { $cond: [{ $eq: ['$research.state', 'done'] }, 1, 0] },
            },
            converted: {
              $sum: { $cond: [{ $ifNull: ['$leadId', false] }, 1, 0] },
            },
          },
        },
      ])
      .exec();
    return searches.map((s) => {
      const c = counts.find((x) => String(x._id) === String(s._id));
      return {
        ...s,
        total: c?.total ?? 0,
        researched: c?.researched ?? 0,
        converted: c?.converted ?? 0,
      };
    });
  }

  async createSearch(tenantId: string, userId: string, dto: CreateSearchDto) {
    const name =
      dto.name?.trim() ||
      [dto.industries?.slice(0, 2).join(', '), dto.location]
        .filter(Boolean)
        .join(' · ') ||
      `Prospección ${new Date().toLocaleDateString('es-PE')}`;
    const search = await this.searchModel.create({
      tenantId: this.oid(tenantId),
      createdBy: this.oid(userId),
      name,
      services: dto.services.trim(),
      idealCustomer: dto.idealCustomer?.trim() ?? '',
      location: dto.location?.trim() ?? '',
      industries: (dto.industries ?? []).map((i) => i.trim()).filter(Boolean),
      maxResults: dto.maxResults ?? 20,
      status: 'searching',
      progress: 'En cola…',
    });
    void this.worker.kick();
    return search;
  }

  async findSearch(id: string, tenantId: string) {
    const search = await this.searchModel
      .findOne({ _id: this.oid(id), tenantId: this.oid(tenantId) })
      .lean()
      .exec();
    if (!search) throw new NotFoundException('Búsqueda no encontrada');
    const prospects = await this.prospectModel
      .find(
        { searchId: search._id, tenantId: search.tenantId },
        LIST_PROJECTION,
      )
      .sort({ fitScore: -1, createdAt: 1 })
      .lean()
      .exec();
    return { ...search, prospects };
  }

  async retrySearch(id: string, tenantId: string) {
    const res = await this.searchModel
      .findOneAndUpdate(
        {
          _id: this.oid(id),
          tenantId: this.oid(tenantId),
          status: { $ne: 'searching' },
        },
        {
          $set: {
            status: 'searching',
            attempts: 0,
            progress: 'En cola…',
            lockedUntil: null,
          },
          $unset: { error: 1 },
        },
        { new: true },
      )
      .exec();
    if (!res)
      throw new BadRequestException('La búsqueda no existe o ya está en curso');
    void this.worker.kick();
    return res;
  }

  async removeSearch(id: string, tenantId: string) {
    const filter = { _id: this.oid(id), tenantId: this.oid(tenantId) };
    const res = await this.searchModel.deleteOne(filter).exec();
    if (!res.deletedCount)
      throw new NotFoundException('Búsqueda no encontrada');
    // Los prospectos ya convertidos se conservan: son parte del seguimiento.
    await this.prospectModel
      .deleteMany({
        searchId: filter._id,
        tenantId: filter.tenantId,
        leadId: null,
        customerId: null,
      })
      .exec();
    await this.prospectModel
      .updateMany(
        { searchId: filter._id, tenantId: filter.tenantId },
        { $unset: { searchId: 1 } },
      )
      .exec();
    return { ok: true };
  }

  // ── Prospectos ─────────────────────────────────────────────────────────

  async listProspects(
    tenantId: string,
    query: { status?: string; q?: string; searchId?: string },
  ) {
    const filter: QueryFilter<Prospect> = { tenantId: this.oid(tenantId) };
    if (query.status) filter.status = query.status as ProspectStatus;
    if (query.searchId) filter.searchId = this.oid(query.searchId);
    if (query.q?.trim()) {
      const rx = new RegExp(
        query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      filter.$or = [
        { name: rx },
        { industry: rx },
        { address: rx },
        { domain: rx },
      ];
    }
    return this.prospectModel
      .find(filter, LIST_PROJECTION)
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean()
      .exec();
  }

  async findProspect(id: string, tenantId: string): Promise<Prospect> {
    const prospect = await this.prospectModel
      .findOne({ _id: this.oid(id), tenantId: this.oid(tenantId) })
      .exec();
    if (!prospect) throw new NotFoundException('Prospecto no encontrado');
    return prospect;
  }

  async createProspect(
    tenantId: string,
    userId: string,
    dto: CreateProspectDto,
  ) {
    const tid = this.oid(tenantId);
    if (dto.searchId) {
      const exists = await this.searchModel.exists({
        _id: this.oid(dto.searchId),
        tenantId: tid,
      });
      if (!exists) throw new NotFoundException('Búsqueda no encontrada');
    }
    const website = normalizeUrl(dto.website);
    return this.prospectModel.create({
      tenantId: tid,
      searchId: dto.searchId ? this.oid(dto.searchId) : undefined,
      createdBy: this.oid(userId),
      name: dto.name.trim(),
      website,
      domain: domainOf(website),
      phone: dto.phone?.trim() || undefined,
      email: dto.email?.trim() || undefined,
      address: dto.address?.trim() || undefined,
      industry: dto.industry?.trim() || undefined,
      description: dto.description?.trim() || undefined,
      source: 'manual',
      fitScore: 0,
    });
  }

  async updateProspect(id: string, tenantId: string, dto: UpdateProspectDto) {
    const set: Record<string, unknown> = { ...dto };
    if (dto.website !== undefined) {
      set.website = normalizeUrl(dto.website) ?? '';
      set.domain = domainOf(dto.website) ?? '';
    }
    const res = await this.prospectModel
      .findOneAndUpdate(
        { _id: this.oid(id), tenantId: this.oid(tenantId) },
        { $set: set },
        { new: true },
      )
      .exec();
    if (!res) throw new NotFoundException('Prospecto no encontrado');
    return res;
  }

  async removeProspect(id: string, tenantId: string) {
    const res = await this.prospectModel
      .deleteOne({ _id: this.oid(id), tenantId: this.oid(tenantId) })
      .exec();
    if (!res.deletedCount)
      throw new NotFoundException('Prospecto no encontrado');
    return { ok: true };
  }

  /** Encola la investigación de varios prospectos a la vez. */
  async queueResearch(ids: string[], tenantId: string) {
    const res = await this.prospectModel
      .updateMany(
        {
          _id: { $in: ids.map((id) => this.oid(id)) },
          tenantId: this.oid(tenantId),
          'research.state': { $nin: ['queued', 'running'] },
        },
        {
          $set: {
            'research.state': 'queued',
            'research.queuedAt': new Date(),
            'research.attempts': 0,
            'research.error': null,
            'research.lockedUntil': null,
            'research.steps': [],
          },
        },
      )
      .exec();
    void this.worker.kick();
    return { queued: res.modifiedCount };
  }

  async queueMaterial(id: string, tenantId: string, instructions?: string) {
    const prospect = await this.findProspect(id, tenantId);
    if (prospect.research?.state !== 'done')
      throw new BadRequestException(
        'Primero investiga la empresa: el material se basa en esa investigación',
      );
    if (['queued', 'running'].includes(prospect.material?.state))
      throw new BadRequestException('El material ya se está generando');
    await this.prospectModel
      .updateOne(
        { _id: prospect._id },
        {
          $set: {
            'material.state': 'queued',
            'material.queuedAt': new Date(),
            'material.attempts': 0,
            'material.error': null,
            'material.lockedUntil': null,
            'material.instructions': instructions?.trim() || '',
          },
        },
      )
      .exec();
    void this.worker.kick();
    return this.findProspect(id, tenantId);
  }

  // ── Conversión a contacto y seguimiento ────────────────────────────────

  async toCustomer(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
    dto: ConvertToCustomerDto,
  ) {
    const prospect = await this.findProspect(id, tenantId);
    const customer = await this.ensureCustomer(
      prospect,
      tenantId,
      userId,
      role,
      dto.personIndex,
    );
    return { prospect: await this.findProspect(id, tenantId), customer };
  }

  async toLead(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
    dto: ConvertToLeadDto,
  ) {
    const prospect = await this.findProspect(id, tenantId);
    if (prospect.leadId)
      throw new BadRequestException('Este prospecto ya tiene un seguimiento');
    const customer = await this.ensureCustomer(
      prospect,
      tenantId,
      userId,
      role,
      dto.personIndex,
    );
    const ai = prospect.research?.ai ?? {};
    const list = (v: unknown) =>
      Array.isArray(v) ? (v as string[]).map((x) => `• ${x}`).join('\n') : '';
    const description = [
      prospect.fitReason || (ai.fitReason as string),
      ai.summary as string,
      ai.opportunities ? `Oportunidades:\n${list(ai.opportunities)}` : '',
      ai.approach ? `Cómo abordarlos: ${ai.approach as string}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const lead = await this.leads.create(tenantId, userId, role, {
      customerId: String(customer._id),
      title: dto.title?.trim() || `${prospect.name}`,
      description: description.slice(0, 5000),
      stage: dto.stage,
      value: dto.value,
      source: 'prospeccion',
      tags: ['prospección', ...(prospect.industry ? [prospect.industry] : [])],
    });

    const talking = list(ai.talkingPoints);
    const outreach = (prospect.material?.outreach ?? {}) as Record<
      string,
      string
    >;
    const note = [
      talking ? `Temas para abrir conversación:\n${talking}` : '',
      outreach.email
        ? `Correo sugerido — ${outreach.emailSubject ?? ''}\n${outreach.email}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    if (note)
      await this.leads.addActivity(String(lead._id), tenantId, userId, role, {
        type: 'note',
        title: 'Investigación de prospección',
        body: note.slice(0, 5000),
      });

    await this.prospectModel
      .updateOne(
        { _id: prospect._id },
        { $set: { leadId: lead._id, status: 'converted' } },
      )
      .exec();
    return {
      prospect: await this.findProspect(id, tenantId),
      leadId: String(lead._id),
    };
  }

  /**
   * Crea (o reutiliza) el contacto de la empresa o de una de sus personas y
   * le deja los datos de la investigación a mano.
   */
  private async ensureCustomer(
    prospect: Prospect,
    tenantId: string,
    userId: string,
    role: string,
    personIndex?: number,
  ): Promise<Customer> {
    const people = prospect.research?.people ?? [];
    let person: ProspectPerson | undefined;
    if (personIndex !== undefined) {
      person = people[personIndex];
      if (!person)
        throw new BadRequestException(
          'Persona no encontrada en la investigación',
        );
    }

    // Sin persona elegida se reutiliza el contacto ya creado para la empresa.
    if (!person && prospect.customerId) {
      const existing = await this.customerModel
        .findById(prospect.customerId)
        .exec();
      if (existing) return existing;
    }
    if (person?.customerId) {
      const existing = await this.customerModel
        .findById(person.customerId)
        .exec();
      if (existing) return existing;
    }

    const email = person
      ? person.email
      : prospect.email || prospect.research?.emails?.[0];
    const phone = person
      ? person.phone
      : prospect.phone || prospect.research?.phones?.[0];
    const customer = await this.leads.upsertCustomer(tenantId, userId, role, {
      name: person ? person.name : prospect.name,
      email,
      phone,
      source: 'prospecting',
    });

    const fields: Record<string, unknown> = {
      'customFields.empresa': prospect.name,
      ...(prospect.website ? { 'customFields.web': prospect.website } : {}),
      ...(prospect.industry
        ? { 'customFields.sector': prospect.industry }
        : {}),
      ...(prospect.address
        ? { 'customFields.direccion': prospect.address }
        : {}),
      ...(person?.role ? { 'customFields.cargo': person.role } : {}),
      ...(person?.linkedin ? { 'customFields.linkedin': person.linkedin } : {}),
    };
    const summary = (prospect.research?.ai as { summary?: string } | undefined)
      ?.summary;
    await this.customerModel
      .updateOne(
        { _id: customer._id },
        {
          $set: {
            ...fields,
            ...(!customer.notes && summary ? { notes: summary } : {}),
          },
          $addToSet: { tags: 'prospección' },
        },
      )
      .exec();

    if (person) {
      await this.prospectModel
        .updateOne(
          { _id: prospect._id },
          {
            $set: {
              [`research.people.${personIndex}.customerId`]: String(
                customer._id,
              ),
            },
          },
        )
        .exec();
      if (!prospect.customerId)
        await this.prospectModel
          .updateOne(
            { _id: prospect._id },
            { $set: { customerId: customer._id } },
          )
          .exec();
    } else {
      await this.prospectModel
        .updateOne(
          { _id: prospect._id },
          { $set: { customerId: customer._id } },
        )
        .exec();
    }
    return customer;
  }
}
