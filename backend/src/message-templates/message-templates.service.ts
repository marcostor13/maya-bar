import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MessageTemplate } from './message-template.schema';
import { Customer } from '../customers/customer.schema';
import { Tenant } from '../tenants/tenant.schema';
import {
  CreateMessageTemplateDto,
  PreviewMessageDto,
  UpdateMessageTemplateDto,
} from './dto/message-template.dto';
import {
  TOKEN_CATALOG,
  TokenInfo,
  TokenSource,
  fillTokensMultiline,
  unknownTokens,
} from '../shared/contact-tokens';
import { SmsSegments, smsSegments } from '../shared/sms-segments';
import { toText } from '../shared/to-text';

export interface MessagePreview {
  subject?: string;
  body: string;
  unknown: string[];
  sms: SmsSegments;
}

/** Cuántos contactos se miran para descubrir campos personalizados. */
const CUSTOM_FIELD_SAMPLE = 500;

const SAMPLE_CONTACT: TokenSource = {
  name: 'María Pérez',
  email: 'maria@correo.com',
  phone: '+51 999 888 777',
};

@Injectable()
export class MessageTemplatesService {
  constructor(
    @InjectModel(MessageTemplate.name) private model: Model<MessageTemplate>,
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
    @InjectModel(Tenant.name) private tenantModel: Model<Tenant>,
  ) {}

  findAll(tenantId: string, channel?: string): Promise<MessageTemplate[]> {
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
    };
    if (channel) filter['channel'] = channel;
    return this.model.find(filter).sort({ updatedAt: -1 }).exec();
  }

  async findOne(id: string, tenantId: string): Promise<MessageTemplate> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('Identificador inválido');
    const template = await this.model
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .exec();
    if (!template) throw new NotFoundException('Plantilla no encontrada');
    return template;
  }

  create(
    tenantId: string,
    userId: string,
    dto: CreateMessageTemplateDto,
  ): Promise<MessageTemplate> {
    return this.model.create({
      name: dto.name.trim(),
      channel: dto.channel as MessageTemplate['channel'],
      body: dto.body,
      subject: dto.channel === 'email' ? dto.subject?.trim() : undefined,
      tenantId: new Types.ObjectId(tenantId),
      createdBy: new Types.ObjectId(userId),
    });
  }

  async update(
    id: string,
    tenantId: string,
    dto: UpdateMessageTemplateDto,
  ): Promise<MessageTemplate> {
    const template = await this.findOne(id, tenantId);
    if (dto.name !== undefined) template.name = dto.name.trim();
    if (dto.channel !== undefined)
      template.channel = dto.channel as MessageTemplate['channel'];
    if (dto.body !== undefined) template.body = dto.body;
    if (dto.subject !== undefined)
      template.subject = dto.subject.trim() || undefined;
    if (template.channel !== 'email') template.subject = undefined;
    return template.save();
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const template = await this.findOne(id, tenantId);
    await this.model.deleteOne({ _id: template._id }).exec();
  }

  /**
   * Variables que se pueden insertar: las fijas más una por cada campo
   * personalizado que exista en los contactos de la empresa.
   */
  async variables(tenantId: string): Promise<TokenInfo[]> {
    const tid = new Types.ObjectId(tenantId);
    const [sample, tenant] = await Promise.all([
      this.customerModel
        .find(
          { tenantId: tid, customFields: { $exists: true, $ne: null } },
          { customFields: 1 },
        )
        .limit(CUSTOM_FIELD_SAMPLE)
        .lean()
        .exec(),
      this.tenantModel.findById(tid, { name: 1 }).lean().exec(),
    ]);
    const examples = new Map<string, string>();
    for (const c of sample) {
      for (const [key, value] of Object.entries(c.customFields ?? {})) {
        if (examples.has(key) || value === null || value === undefined)
          continue;
        if (typeof value === 'object') continue;
        examples.set(key, toText(value).slice(0, 40));
      }
    }
    return [
      ...TOKEN_CATALOG.map((t) =>
        t.token === '{empresa}' && tenant?.name
          ? { ...t, example: tenant.name }
          : t,
      ),
      ...[...examples.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, example]) => ({
          token: `{campo:${key}}`,
          label: key,
          example,
        })),
    ];
  }

  /** Cómo quedaría el mensaje para un contacto real o para uno de ejemplo. */
  async preview(
    tenantId: string,
    dto: PreviewMessageDto,
  ): Promise<MessagePreview> {
    const tid = new Types.ObjectId(tenantId);
    let contact: TokenSource = SAMPLE_CONTACT;
    if (dto.customerId) {
      const customer = await this.customerModel
        .findOne({ _id: dto.customerId, tenantId: tid })
        .lean()
        .exec();
      if (!customer) throw new NotFoundException('Contacto no encontrado');
      contact = customer;
    }
    const tenant = await this.tenantModel
      .findById(tid, { name: 1 })
      .lean()
      .exec();
    const catalog = Object.fromEntries(
      TOKEN_CATALOG.map((t) => [t.token, t.example]),
    );
    const ctx = {
      empresa: tenant?.name ?? catalog['{empresa}'],
      link: catalog['{link}'],
      baja: catalog['{baja}'],
    };
    const body = fillTokensMultiline(dto.body, contact, ctx);
    return {
      subject: dto.subject
        ? fillTokensMultiline(dto.subject, contact, ctx)
        : undefined,
      body,
      unknown: unknownTokens(`${dto.subject ?? ''} ${dto.body}`),
      sms: smsSegments(body),
    };
  }
}
