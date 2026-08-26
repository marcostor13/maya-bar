import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { ContactForm, FormField } from './form.schema';
import { FormSubmission } from './form-submission.schema';
import { Customer } from '../customers/customer.schema';
import { ContactList } from '../lists/contact-list.schema';
import { CreateFormDto, UpdateFormDto } from './dto/form.dto';
import { isOwnerScoped } from '../auth/permissions';

/** Metadatos de la petición pública que sirven para trazar el origen. */
export interface SubmitContext {
  pageUrl?: string;
  referer?: string;
  ip?: string;
  userAgent?: string;
}

export interface SubmitResult {
  ok: true;
  message: string;
  redirectUrl?: string;
  customerId: string;
  created: boolean;
}

/** Vista pública del formulario: nunca expone tags, listas ni contadores. */
export interface PublicForm {
  publicKey: string;
  name: string;
  description?: string;
  fields: FormField[];
  successMessage: string;
  redirectUrl?: string;
}

@Injectable()
export class FormsService {
  constructor(
    @InjectModel(ContactForm.name) private formModel: Model<ContactForm>,
    @InjectModel(FormSubmission.name)
    private submissionModel: Model<FormSubmission>,
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
    @InjectModel(ContactList.name) private listModel: Model<ContactList>,
  ) {}

  // ─── CRUD interno ─────────────────────────────────────────────────────────

  async findAll(
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<ContactForm[]> {
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
    };
    if (isOwnerScoped(role)) filter['createdBy'] = new Types.ObjectId(userId);
    return this.formModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findOne(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<ContactForm> {
    const form = await this.formModel.findById(id).exec();
    if (!form) throw new NotFoundException('Formulario no encontrado');
    if (form.tenantId.toString() !== tenantId) throw new ForbiddenException();
    if (isOwnerScoped(role) && form.createdBy?.toString() !== userId)
      throw new ForbiddenException();
    return form;
  }

  async create(
    tenantId: string,
    userId: string,
    role: string,
    dto: CreateFormDto,
  ): Promise<ContactForm> {
    const form = new this.formModel({
      ...dto,
      fields: this.normalizeFields(dto.fields),
      tenantId: new Types.ObjectId(tenantId),
      listIds: (dto.listIds ?? []).map((lid) => new Types.ObjectId(lid)),
      publicKey: this.generateKey(),
      ...(isOwnerScoped(role) ? { createdBy: new Types.ObjectId(userId) } : {}),
    });
    return form.save();
  }

  async update(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
    dto: UpdateFormDto,
  ): Promise<ContactForm> {
    const form = await this.findOne(id, tenantId, userId, role);
    Object.assign(form, {
      ...dto,
      ...(dto.fields ? { fields: this.normalizeFields(dto.fields) } : {}),
      ...(dto.listIds
        ? { listIds: dto.listIds.map((lid) => new Types.ObjectId(lid)) }
        : {}),
    });
    return form.save();
  }

  async delete(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<void> {
    const form = await this.findOne(id, tenantId, userId, role);
    await this.submissionModel.deleteMany({ formId: form._id }).exec();
    await this.formModel.findByIdAndDelete(form._id).exec();
  }

  /** Invalida el embed ya publicado y entrega una clave nueva. */
  async regenerateKey(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<ContactForm> {
    const form = await this.findOne(id, tenantId, userId, role);
    form.publicKey = this.generateKey();
    return form.save();
  }

  async findSubmissions(
    id: string,
    tenantId: string,
    userId: string,
    role: string,
    limit = 100,
  ): Promise<FormSubmission[]> {
    const form = await this.findOne(id, tenantId, userId, role);
    return this.submissionModel
      .find({ formId: form._id })
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 500))
      .exec();
  }

  // ─── API pública ──────────────────────────────────────────────────────────

  async findPublic(publicKey: string): Promise<PublicForm> {
    const form = await this.formModel
      .findOne({ publicKey, active: true })
      .exec();
    if (!form)
      throw new NotFoundException('Formulario no encontrado o desactivado');
    return {
      publicKey: form.publicKey,
      name: form.name,
      description: form.description,
      fields: form.fields,
      successMessage: form.successMessage,
      redirectUrl: form.redirectUrl,
    };
  }

  /**
   * Convierte un envío en contacto. Deduplica por email y, en su defecto, por
   * teléfono dentro del tenant; si el contacto ya existe se completa sin borrar
   * lo que ya tenía y se conserva el origen con el que entró la primera vez.
   */
  async submit(
    publicKey: string,
    body: Record<string, unknown>,
    ctx: SubmitContext,
  ): Promise<SubmitResult> {
    const form = await this.formModel
      .findOne({ publicKey, active: true })
      .exec();
    if (!form)
      throw new NotFoundException('Formulario no encontrado o desactivado');

    const answers = this.collectAnswers(form, body);
    const { mapped, customFields } = this.splitAnswers(form, answers);

    const email = mapped['email']?.toLowerCase().trim() || undefined;
    const phone = mapped['phone']?.trim() || undefined;
    if (!email && !phone)
      throw new BadRequestException(
        'El formulario debe capturar al menos un email o un teléfono',
      );

    const tid = form.tenantId;
    const dedupe: Record<string, unknown> = email
      ? { tenantId: tid, email }
      : { tenantId: tid, phone };
    dedupe['createdBy'] = form.createdBy ?? { $exists: false };

    const existing = await this.customerModel.findOne(dedupe).exec();

    let customer: Customer;
    let created = false;
    if (existing) {
      if (mapped['name']) existing.name = mapped['name'].trim();
      if (email) existing.email = email;
      if (phone) existing.phone = phone;
      if (mapped['notes']) existing.notes = mapped['notes'];
      existing.tags = Array.from(new Set([...existing.tags, ...form.tags]));
      existing.customFields = { ...existing.customFields, ...customFields };
      if (!existing.formId) {
        existing.formId = form._id as Types.ObjectId;
        existing.sourceLabel = existing.sourceLabel || form.name;
      }
      customer = await existing.save();
    } else {
      customer = await new this.customerModel({
        tenantId: tid,
        name: mapped['name']?.trim() || email || phone,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(mapped['notes'] ? { notes: mapped['notes'] } : {}),
        tags: [...form.tags],
        customFields,
        source: 'form',
        formId: form._id,
        sourceLabel: form.name,
        sourceUrl: ctx.pageUrl || ctx.referer,
        ...(form.createdBy ? { createdBy: form.createdBy } : {}),
      }).save();
      created = true;
    }

    if (form.listIds.length > 0) await this.addToLists(form.listIds, customer);

    await this.submissionModel.create({
      tenantId: tid,
      formId: form._id,
      customerId: customer._id,
      data: answers,
      pageUrl: ctx.pageUrl,
      referer: ctx.referer,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    await this.formModel
      .updateOne(
        { _id: form._id },
        {
          $inc: { submissionCount: 1 },
          $set: { lastSubmissionAt: new Date() },
        },
      )
      .exec();

    return {
      ok: true,
      message: form.successMessage,
      redirectUrl: form.redirectUrl,
      customerId: String(customer._id),
      created,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * El embed manda `{ data: {...} }`, pero un `<form>` HTML plano manda los
   * campos en la raíz del body. Se aceptan ambas formas.
   */
  private collectAnswers(
    form: ContactForm,
    body: Record<string, unknown>,
  ): Record<string, unknown> {
    const inner = body?.['data'];
    const raw =
      inner && typeof inner === 'object'
        ? (inner as Record<string, unknown>)
        : (body ?? {});

    const answers: Record<string, unknown> = {};
    for (const field of form.fields) {
      const value = raw[field.key];
      const empty =
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim() === '');
      if (field.required && empty)
        throw new BadRequestException(
          `El campo "${field.label}" es obligatorio`,
        );
      if (!empty) answers[field.key] = value;
    }
    return answers;
  }

  /** Separa lo que va a columnas del contacto de lo que va a `customFields`. */
  private splitAnswers(
    form: ContactForm,
    answers: Record<string, unknown>,
  ): {
    mapped: Record<string, string>;
    customFields: Record<string, unknown>;
  } {
    const mapped: Record<string, string> = {};
    const customFields: Record<string, unknown> = {};
    for (const field of form.fields) {
      if (!(field.key in answers)) continue;
      const value = answers[field.key];
      if (field.mapTo) mapped[field.mapTo] = String(value).trim();
      else customFields[field.label || field.key] = value;
    }
    return { mapped, customFields };
  }

  /** `memberCount` está denormalizado: hay que recalcularlo tras cada alta. */
  private async addToLists(
    listIds: Types.ObjectId[],
    customer: Customer,
  ): Promise<void> {
    await this.listModel
      .updateMany(
        { _id: { $in: listIds }, type: 'static' },
        { $addToSet: { memberIds: customer._id } },
      )
      .exec();
    const lists = await this.listModel.find({ _id: { $in: listIds } }).exec();
    await Promise.all(
      lists.map((list) =>
        this.listModel
          .updateOne(
            { _id: list._id },
            { $set: { memberCount: list.memberIds.length } },
          )
          .exec(),
      ),
    );
  }

  private generateKey(): string {
    return randomBytes(18).toString('hex');
  }

  private normalizeFields(fields?: CreateFormDto['fields']): FormField[] {
    return (fields ?? []).map((f) => ({
      key: f.key.trim(),
      label: f.label.trim(),
      type: f.type as FormField['type'],
      placeholder: f.placeholder,
      required: f.required ?? false,
      options: f.options ?? [],
      mapTo: (f.mapTo ?? '') as FormField['mapTo'],
    }));
  }
}
