import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
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
import { formatPhone } from '../shared/phone';
import { fillTokens, fillTokensMultiline } from '../shared/contact-tokens';
import { SettingsService } from '../settings/settings.service';
import { MailService } from '../mail/mail.service';
import { WhatsAppTemplatesService } from '../whatsapp-templates/whatsapp-templates.service';

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
  /** El contacto ya se había registrado antes en ESTE formulario. */
  duplicate: boolean;
  /** Igual que `duplicate`, con el nombre que espera el embed. */
  registered: boolean;
}

/** Lo que se responde cuando la persona ya estaba registrada en el formulario. */
const ALREADY_REGISTERED_MESSAGE =
  'Ya estás registrado con estos datos. No hace falta que lo envíes otra vez.';

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
  private readonly logger = new Logger(FormsService.name);

  constructor(
    @InjectModel(ContactForm.name) private formModel: Model<ContactForm>,
    @InjectModel(FormSubmission.name)
    private submissionModel: Model<FormSubmission>,
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
    @InjectModel(ContactList.name) private listModel: Model<ContactList>,
    private settings: SettingsService,
    private mail: MailService,
    private templates: WhatsAppTemplatesService,
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
    // Los contactos se quedan: lo que se va es la referencia, para que el
    // formulario borrado no siga apareciendo en sus filtros.
    await this.customerModel
      .updateMany({ formIds: form._id }, { $pull: { formIds: form._id } })
      .exec();
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
   *
   * Un reenvío de alguien que YA se había registrado en este mismo formulario
   * no es un alta: se responde `duplicate: true, registered: true` y no se
   * apunta un envío nuevo, no se suma al contador ni se repiten las respuestas
   * automáticas. Estar en la base por otro formulario no cuenta como duplicado:
   * para esta landing sigue siendo un registro nuevo.
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
    const phone = formatPhone(mapped['phone']);
    if (!email && !phone)
      throw new BadRequestException(
        'El formulario debe capturar al menos un email o un teléfono',
      );

    const tid = form.tenantId;
    const { customer, created, linkedBefore } = await this.resolveCustomer(
      form,
      ctx,
      {
        email,
        phone,
        name: mapped['name']?.trim(),
        notes: mapped['notes'],
        customFields,
      },
    );

    // Los datos del contacto sí se han refrescado con lo que acaba de mandar,
    // pero el registro no se repite: sin `redirectUrl`, para que la landing
    // muestre el aviso en vez de saltar a la página de gracias.
    if (
      !created &&
      (await this.isAlreadyRegistered(form, customer, linkedBefore))
    )
      return {
        ok: true,
        message: ALREADY_REGISTERED_MESSAGE,
        customerId: String(customer._id),
        created: false,
        duplicate: true,
        registered: true,
      };

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

    // Las respuestas automáticas no bloquean ni pueden tumbar el registro: el
    // visitante ya envió sus datos y guardarlos es lo que de verdad importa.
    await this.sendAutoReplies(form, customer);

    return {
      ok: true,
      message: form.successMessage,
      redirectUrl: form.redirectUrl,
      customerId: String(customer._id),
      created,
      duplicate: false,
      registered: false,
    };
  }

  /**
   * ¿Esta persona ya se había registrado en este mismo formulario? El vínculo
   * vive en `formIds` del contacto, pero los contactos anteriores a ese campo
   * no lo tienen: para ellos vale con que exista un envío suyo al formulario.
   */
  private async isAlreadyRegistered(
    form: ContactForm,
    customer: Customer,
    linkedBefore: boolean,
  ): Promise<boolean> {
    if (linkedBefore) return true;
    const previous = await this.submissionModel
      .exists({ formId: form._id, customerId: customer._id })
      .exec();
    return !!previous;
  }

  /** Dispara el WhatsApp y el email de bienvenida configurados en el formulario. */
  private async sendAutoReplies(
    form: ContactForm,
    customer: Customer,
  ): Promise<void> {
    const contact = {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
    };

    const tasks: Promise<unknown>[] = [];

    const wa = form.autoWhatsApp;
    if (wa?.enabled && wa.templateName && customer.phone) {
      tasks.push(
        this.templates
          .resolveSendHeader(
            String(form.tenantId),
            wa.templateName,
            wa.headerMediaUrl,
          )
          .then((header) =>
            this.settings.sendWhatsAppTemplate(
              customer.phone!,
              wa.templateName!,
              wa.templateLanguage ?? 'es',
              (wa.templateVars ?? []).map((v) => fillTokens(v, contact)),
              String(form.tenantId),
              header?.text
                ? { ...header, text: fillTokens(header.text, contact) }
                : header,
            ),
          )
          .catch((err) =>
            this.logger.warn(
              `No se pudo enviar el WhatsApp de "${form.name}" a ${customer.phone}: ${String(err)}`,
            ),
          ),
      );
    }

    const mail = form.autoEmail;
    if (mail?.enabled && mail.body && customer.email) {
      tasks.push(
        this.mail
          .sendCampaign({
            to: customer.email,
            name: customer.name,
            subject: fillTokens(mail.subject || form.name, contact),
            body: fillTokensMultiline(mail.body, contact),
          })
          .catch((err) =>
            this.logger.warn(
              `No se pudo enviar el email de "${form.name}" a ${customer.email}: ${String(err)}`,
            ),
          ),
      );
    }

    await Promise.all(tasks);
  }

  /**
   * Encuentra el contacto al que pertenece el envío, o lo crea.
   *
   * Los índices de `customers` son únicos por (email, tenant, dueño) y por
   * (teléfono, tenant, dueño). Buscar solo por email dejaba escapar el caso más
   * común de una landing: alguien que ya está en la base con su teléfono vuelve
   * a registrarse con otro correo. No se encontraba nada, se intentaba insertar
   * y Mongo devolvía E11000, que salía al visitante como un 500.
   */
  private async resolveCustomer(
    form: ContactForm,
    ctx: SubmitContext,
    data: {
      email?: string;
      phone?: string;
      name?: string;
      notes?: string;
      customFields: Record<string, unknown>;
    },
  ): Promise<{
    customer: Customer;
    created: boolean;
    /** Ya venía vinculado a este formulario, antes de fusionar este envío. */
    linkedBefore: boolean;
  }> {
    const { email, phone } = data;
    // `createdBy: null` casa con el campo ausente y con el guardado a null;
    // `$exists: false` solo casaba con el primero.
    const scope = {
      tenantId: form.tenantId,
      createdBy: form.createdBy ?? null,
    };

    const [byEmail, byPhone] = await Promise.all([
      email ? this.customerModel.findOne({ ...scope, email }).exec() : null,
      phone ? this.customerModel.findOne({ ...scope, phone }).exec() : null,
    ]);

    // El email identifica a una persona mejor que un teléfono, que puede ser
    // compartido; si apuntan a contactos distintos manda el del email.
    const existing = byEmail ?? byPhone;

    if (existing) {
      // Se mira antes del merge: `mergeIntoCustomer` añade el formulario.
      const linkedBefore = hasForm(existing, form._id);
      return {
        customer: await this.mergeIntoCustomer(existing, form, data, {
          byEmail,
          byPhone,
        }),
        created: false,
        linkedBefore,
      };
    }

    try {
      const customer = await new this.customerModel({
        tenantId: form.tenantId,
        name: data.name || email || phone,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(data.notes ? { notes: data.notes } : {}),
        tags: [...form.tags],
        customFields: data.customFields,
        source: 'form',
        formId: form._id,
        formIds: [form._id],
        sourceLabel: form.name,
        sourceUrl: ctx.pageUrl || ctx.referer,
        ...(form.createdBy ? { createdBy: form.createdBy } : {}),
      }).save();
      return { customer, created: true, linkedBefore: false };
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      // Dos envíos simultáneos del mismo visitante: el otro ganó la carrera.
      // Se recupera el contacto que acaba de crearse y se completa con este.
      const raced = await this.customerModel
        .findOne(email ? { ...scope, email } : { ...scope, phone })
        .exec();
      if (!raced)
        throw new ConflictException(
          'Ya tenemos estos datos registrados. Si necesitas actualizarlos, ponte en contacto con nosotros.',
        );
      const linkedBefore = hasForm(raced, form._id);
      return {
        customer: await this.mergeIntoCustomer(raced, form, data, {
          byEmail: null,
          byPhone: null,
        }),
        created: false,
        linkedBefore,
      };
    }
  }

  /**
   * Completa un contacto existente con lo que trae el envío. Nunca pisa un dato
   * ya guardado ni el de otro contacto: un email o teléfono distinto se archiva
   * como campo adicional en vez de romper el índice único.
   */
  private async mergeIntoCustomer(
    existing: Customer,
    form: ContactForm,
    data: {
      email?: string;
      phone?: string;
      name?: string;
      notes?: string;
      customFields: Record<string, unknown>;
    },
    owners: { byEmail: Customer | null; byPhone: Customer | null },
  ): Promise<Customer> {
    const id = String(existing._id);
    const extra: Record<string, unknown> = { ...data.customFields };

    if (data.name) existing.name = data.name;
    if (data.notes) existing.notes = data.notes;

    if (data.email && existing.email !== data.email) {
      const libre = !owners.byEmail || String(owners.byEmail._id) === id;
      if (!existing.email && libre) existing.email = data.email;
      else extra['Email alternativo'] = data.email;
    }

    if (data.phone && existing.phone !== data.phone) {
      const libre = !owners.byPhone || String(owners.byPhone._id) === id;
      if (!existing.phone && libre) existing.phone = data.phone;
      else extra['Teléfono alternativo'] = data.phone;
    }

    existing.tags = Array.from(new Set([...existing.tags, ...form.tags]));
    existing.customFields = { ...existing.customFields, ...extra };
    // El origen no se pisa: interesa por dónde entró la primera vez.
    if (!existing.formId) {
      existing.formId = form._id;
      existing.sourceLabel = existing.sourceLabel || form.name;
    }
    // Pero sí se acumula el formulario: la misma persona puede registrarse en
    // varias landings y hay que poder filtrarla por cualquiera de ellas.
    existing.formIds = addFormId(existing.formIds, form._id);

    try {
      return await existing.save();
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      throw new ConflictException(
        'Esos datos ya pertenecen a otro registro. Revisa el correo y el teléfono, o ponte en contacto con nosotros.',
      );
    }
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

/**
 * Añade el formulario a la lista del contacto sin repetirlo. Se compara por
 * cadena porque un mismo ObjectId puede llegar como documento hidratado o como
 * valor plano según de dónde venga el contacto.
 */
/** ¿El contacto ya está vinculado a este formulario? */
function hasForm(customer: Customer, formId: Types.ObjectId): boolean {
  const key = String(formId);
  return (
    (customer.formIds ?? []).some((id) => String(id) === key) ||
    String(customer.formId ?? '') === key
  );
}

function addFormId(
  current: Types.ObjectId[] | undefined,
  formId: Types.ObjectId,
): Types.ObjectId[] {
  const list = current ?? [];
  const key = String(formId);
  return list.some((id) => String(id) === key) ? list : [...list, formId];
}

/** E11000: Mongo rechazó la escritura por chocar con un índice único. */
function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: number } | null)?.code === 11000;
}
