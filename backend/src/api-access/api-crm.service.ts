import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer } from '../customers/customer.schema';
import { Lead } from '../leads/lead.schema';
import { LeadsService } from '../leads/leads.service';
import { emitAutomation } from '../automations/automation-bus';
import { formatPhone } from '../shared/phone';
import { ApiAccess } from './api-access.schema';
import { ApiMessagesService } from './api-messages.service';
import { contactView, leadView } from './api-hooks.service';
import type {
  ApiListQueryDto,
  CreateApiLeadDto,
  UpdateApiContactDto,
  UpsertApiContactDto,
  ApiWhatsappTemplateDto,
} from './dto/api-crm.dto';

const ADMIN = 'TENANT_ADMIN';
const cleanTags = (tags: string[] = []) => [
  ...new Set(tags.map((t) => String(t).trim()).filter(Boolean)),
];

/**
 * API del CRM para Zapier, Make y servidores (HU65): contactos, oportunidades,
 * etiquetas y envío de plantillas, siempre dentro de la empresa de la clave.
 */
@Injectable()
export class ApiCrmService {
  constructor(
    @InjectModel(Customer.name) private customers: Model<Customer>,
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
    private leads: LeadsService,
    private messages: ApiMessagesService,
  ) {}

  private tid(access: ApiAccess) {
    return new Types.ObjectId(String(access.tenantId));
  }

  private actor(access: ApiAccess): string {
    return String(access.createdBy ?? access._id);
  }

  // ── Contactos ──────────────────────────────────────────────────────────

  async listContacts(access: ApiAccess, q: ApiListQueryDto) {
    const filter: Record<string, unknown> = { tenantId: this.tid(access) };
    if (q.email) filter.email = q.email.toLowerCase().trim();
    if (q.phone) filter.phone = formatPhone(q.phone);
    const since = this.since(q.since);
    if (since) filter.updatedAt = { $gt: since };
    const docs = await this.customers
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(q.limit ?? 25)
      .exec();
    return docs.map(contactView);
  }

  async getContact(access: ApiAccess, id: string) {
    return contactView(await this.ownContact(access, id));
  }

  /** Crea o, si ya existe por email o teléfono, actualiza. `created` dice cuál. */
  async upsertContact(access: ApiAccess, dto: UpsertApiContactDto) {
    const email = dto.email?.toLowerCase().trim() || undefined;
    const phone = formatPhone(dto.phone) || undefined;
    if (!email && !phone)
      throw new BadRequestException('Envía al menos email o phone');
    const existing =
      (email
        ? await this.customers
            .findOne({ tenantId: this.tid(access), email })
            .exec()
        : null) ??
      (phone
        ? await this.customers
            .findOne({ tenantId: this.tid(access), phone })
            .exec()
        : null);
    if (existing) {
      const c = await this.applyUpdate(access, existing, {
        ...dto,
        email,
        phone,
      });
      return { created: false, contact: contactView(c) };
    }
    const name = dto.name?.trim() || email || phone || '';
    const tags = cleanTags(dto.tags);
    try {
      const saved = await this.customers.create({
        tenantId: this.tid(access),
        name,
        email,
        phone,
        tags,
        notes: dto.notes,
        source: 'api',
      });
      const tenantId = String(access.tenantId);
      emitAutomation({
        type: 'contact_created',
        tenantId,
        customerId: String(saved._id),
      });
      if (tags.length)
        emitAutomation({
          type: 'tag_added',
          tenantId,
          customerIds: [String(saved._id)],
          tags,
        });
      return { created: true, contact: contactView(saved) };
    } catch (err) {
      if ((err as { code?: number }).code === 11000)
        throw new ConflictException(
          'Ya existe un contacto con ese email o teléfono',
        );
      throw err;
    }
  }

  async updateContact(access: ApiAccess, id: string, dto: UpdateApiContactDto) {
    const c = await this.ownContact(access, id);
    return contactView(
      await this.applyUpdate(access, c, {
        ...dto,
        email: dto.email?.toLowerCase().trim() || undefined,
        phone:
          dto.phone !== undefined
            ? formatPhone(dto.phone) || undefined
            : undefined,
      }),
    );
  }

  async addTags(access: ApiAccess, id: string, tags: string[]) {
    const c = await this.ownContact(access, id);
    const wanted = cleanTags(tags);
    if (!wanted.length)
      throw new BadRequestException('Indica al menos una etiqueta');
    const add = wanted.filter((t) => !(c.tags ?? []).includes(t));
    if (add.length) {
      c.tags = [...(c.tags ?? []), ...add];
      await c.save();
      emitAutomation({
        type: 'tag_added',
        tenantId: String(access.tenantId),
        customerIds: [String(c._id)],
        tags: add,
      });
    }
    return contactView(c);
  }

  private async applyUpdate(
    access: ApiAccess,
    c: Customer,
    dto: UpsertApiContactDto,
  ): Promise<Customer> {
    if (dto.name?.trim()) c.name = dto.name.trim();
    if (dto.email) c.email = dto.email;
    if (dto.phone) c.phone = dto.phone;
    if (dto.notes !== undefined)
      (c as unknown as { notes?: string }).notes = dto.notes;
    const add = cleanTags(dto.tags).filter((t) => !(c.tags ?? []).includes(t));
    if (add.length) c.tags = [...(c.tags ?? []), ...add];
    try {
      await c.save();
    } catch (err) {
      if ((err as { code?: number }).code === 11000)
        throw new ConflictException(
          'Otro contacto ya usa ese email o teléfono',
        );
      throw err;
    }
    if (add.length)
      emitAutomation({
        type: 'tag_added',
        tenantId: String(access.tenantId),
        customerIds: [String(c._id)],
        tags: add,
      });
    return c;
  }

  private async ownContact(access: ApiAccess, id: string): Promise<Customer> {
    const c = Types.ObjectId.isValid(id)
      ? await this.customers
          .findOne({ _id: id, tenantId: this.tid(access) })
          .exec()
      : null;
    if (!c) throw new NotFoundException('Contacto no encontrado');
    return c;
  }

  // ── Oportunidades ─────────────────────────────────────────────────────

  async listLeads(access: ApiAccess, q: ApiListQueryDto) {
    const filter: Record<string, unknown> = { tenantId: this.tid(access) };
    const since = this.since(q.since);
    if (since) filter.updatedAt = { $gt: since };
    const docs = await this.leadModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(q.limit ?? 25)
      .exec();
    return docs.map(leadView);
  }

  async createLead(access: ApiAccess, dto: CreateApiLeadDto) {
    let customerId = dto.contactId;
    if (customerId) await this.ownContact(access, customerId);
    else if (dto.contact)
      customerId = (await this.upsertContact(access, dto.contact)).contact.id;
    else throw new BadRequestException('Envía contactId o contact');
    const lead = await this.leads.create(
      String(access.tenantId),
      this.actor(access),
      ADMIN,
      {
        customerId,
        title: dto.title.trim(),
        value: dto.value,
        currency: dto.currency,
        stage: dto.stage,
        ownerId: dto.ownerId ?? '',
        source: 'api',
        tags: dto.tags,
      },
    );
    return leadView(lead);
  }

  // ── WhatsApp ──────────────────────────────────────────────────────────

  async sendWhatsappTemplate(
    access: ApiAccess,
    dto: ApiWhatsappTemplateDto,
    idempotencyKey?: string,
  ) {
    if (access.channel !== 'whatsapp')
      throw new BadRequestException(
        'Esta clave no está ligada a una cuenta de WhatsApp',
      );
    let to = dto.to?.trim();
    if (!to && dto.contactId)
      to = (await this.ownContact(access, dto.contactId)).phone;
    if (!to)
      throw new BadRequestException('Envía to o un contactId con teléfono');
    return this.messages.send(
      access,
      { to, template: dto.template },
      idempotencyKey,
    );
  }

  private since(raw?: string): Date | undefined {
    if (!raw) return undefined;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime()))
      throw new BadRequestException('since debe ser una fecha ISO');
    return d;
  }
}
