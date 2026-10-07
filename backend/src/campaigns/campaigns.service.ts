import {
  OnModuleInit,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WhatsAppTemplatesService } from '../whatsapp-templates/whatsapp-templates.service';
import {
  fillTokens,
  fillTokensMultiline,
  usesToken,
} from '../shared/contact-tokens';
import { CampaignRecipient } from './campaign-recipient.schema';
import { CampaignSenderService } from './campaign-sender.service';
import { EmailTemplate } from '../email-templates/email-template.schema';
import { EmailAccountsService } from '../email-accounts/email-accounts.service';
import { SmsService } from '../sms/sms.service';
import { ResendService } from '../resend/resend.service';
import { LinksService, normalizeDestination } from '../links/links.service';
import { smsSegments } from '../shared/sms-segments';
import { Campaign } from './campaign.schema';
import { SuppressionService } from '../suppression/suppression.service';
import { Customer } from '../customers/customer.schema';
import { SettingsService } from '../settings/settings.service';
import { ListsService } from '../lists/lists.service';
import {
  AudiencePreviewDto,
  CreateCampaignDto,
  UpdateCampaignDto,
} from './dto/campaign.dto';
import { AiService } from '../ai/ai.service';

@Injectable()
export class CampaignsService implements OnModuleInit {
  private readonly logger = new Logger(CampaignsService.name);

  /**
   * La cola de envío WAHA vive en memoria: si el proceso se reinicia a mitad
   * de un envío, la campaña queda en 'sending' para siempre (y update/resend
   * la bloquean). Al arrancar, toda campaña de WhatsApp en 'sending' es
   * huérfana por definición — se marca como fallida para poder reintentarla.
   *
   * Las de email y SMS no: sus destinatarios están en base de datos y el
   * worker (`CampaignSenderService`) las retoma en la siguiente pasada.
   */
  async onModuleInit() {
    const res = await this.campaignModel
      .updateMany(
        { status: 'sending', type: 'whatsapp' },
        {
          $set: {
            status: 'failed',
            errorMessage:
              'Envío interrumpido por un reinicio del servidor — vuelve a enviarla',
          },
        },
      )
      .exec();
    if (res.modifiedCount > 0) {
      this.logger.warn(
        `${res.modifiedCount} campaña(s) en 'sending' huérfanas marcadas como fallidas`,
      );
    }
  }

  constructor(
    @InjectModel(Campaign.name) private campaignModel: Model<Campaign>,
    private templates: WhatsAppTemplatesService,
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
    private settings: SettingsService,
    private lists: ListsService,
    private ai: AiService,
    private suppression: SuppressionService,
    @InjectModel(CampaignRecipient.name)
    private recipientModel: Model<CampaignRecipient>,
    @InjectModel(EmailTemplate.name)
    private emailTemplateModel: Model<EmailTemplate>,
    private sender: CampaignSenderService,
    private emailAccounts: EmailAccountsService,
    private sms: SmsService,
    private resendAccounts: ResendService,
    private links: LinksService,
  ) {}

  async findAll(tenantId: string): Promise<Campaign[]> {
    // Sin la copia del HTML: el listado no la necesita y puede pesar mucho.
    return this.campaignModel
      .find({ tenantId: new Types.ObjectId(tenantId) }, { html: 0 })
      .sort({ createdAt: -1 })
      .exec();
  }

  async create(tenantId: string, dto: CreateCampaignDto): Promise<Campaign> {
    const campaign = new this.campaignModel({
      targeting: 'tags',
      recipientTags: [],
      ...this.normalize(dto),
      type: dto.type,
      tenantId: new Types.ObjectId(tenantId),
    });
    return campaign.save();
  }

  /**
   * Pasa el DTO a lo que guarda el esquema: ids como ObjectId, fechas como
   * Date y cadenas vacías como "quitar el valor". Solo toca lo que viene.
   */
  private normalize(dto: UpdateCampaignDto): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const copy = [
      'name',
      'waProvider',
      'subject',
      'targeting',
      'recipientTags',
      'mediaUrl',
      'mediaType',
      'templateName',
      'templateLanguage',
      'templateVars',
    ] as const;
    for (const key of copy) if (dto[key] !== undefined) out[key] = dto[key];

    if (dto.body !== undefined) out['body'] = dto.body;
    const oid = (value: string, label: string) => {
      if (!Types.ObjectId.isValid(value))
        throw new BadRequestException(`${label} inválido`);
      return new Types.ObjectId(value);
    };
    if (dto.listIds !== undefined)
      out['listIds'] = dto.listIds.map((id) => oid(id, 'Lista'));
    if (dto.customerIds !== undefined)
      out['customerIds'] = dto.customerIds.map((id) => oid(id, 'Contacto'));
    if (dto.emailTemplateId !== undefined)
      out['emailTemplateId'] = dto.emailTemplateId
        ? oid(dto.emailTemplateId, 'Plantilla')
        : undefined;
    if (dto.senderAccountId !== undefined)
      out['senderAccountId'] = dto.senderAccountId
        ? oid(dto.senderAccountId, 'Buzón')
        : undefined;
    if (dto.linkUrl !== undefined)
      out['linkUrl'] = dto.linkUrl.trim()
        ? normalizeDestination(dto.linkUrl)
        : undefined;
    if (dto.linkDomain !== undefined)
      out['linkDomain'] = dto.linkDomain.trim().toLowerCase() || undefined;
    if (dto.scheduledAt !== undefined) {
      const when = dto.scheduledAt ? new Date(dto.scheduledAt) : undefined;
      if (when && Number.isNaN(when.getTime()))
        throw new BadRequestException('Fecha de programación inválida');
      out['scheduledAt'] = when;
    }
    return out;
  }

  async update(
    id: string,
    tenantId: string,
    dto: UpdateCampaignDto,
  ): Promise<Campaign> {
    const campaign = await this.campaignModel.findById(id).exec();
    if (!campaign) throw new NotFoundException('Campaña no encontrada');
    if (campaign.tenantId.toString() !== tenantId)
      throw new ForbiddenException();
    if (campaign.status === 'sending')
      throw new BadRequestException(
        'No se puede editar una campaña mientras se envía',
      );
    if (campaign.status === 'scheduled')
      throw new BadRequestException(
        'La campaña está programada: cancélala para poder editarla',
      );
    Object.assign(campaign, this.normalize(dto));
    return campaign.save();
  }

  async resend(id: string, tenantId: string): Promise<Campaign> {
    const campaign = await this.campaignModel.findById(id).exec();
    if (!campaign) throw new NotFoundException('Campaña no encontrada');
    if (campaign.tenantId.toString() !== tenantId)
      throw new ForbiddenException();
    if (campaign.status === 'sending' || campaign.status === 'scheduled')
      throw new BadRequestException('La campaña ya está en proceso de envío');
    campaign.status = 'draft';
    campaign.errorMessage = undefined;
    campaign.sentAt = undefined;
    // Reenviar es enviar ahora, no volver a esperar a la fecha antigua.
    campaign.scheduledAt = undefined;
    await campaign.save();
    return this.send(id, tenantId);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const campaign = await this.campaignModel.findById(id).exec();
    if (!campaign) throw new NotFoundException('Campaña no encontrada');
    if (campaign.tenantId.toString() !== tenantId)
      throw new ForbiddenException();
    await this.campaignModel.findByIdAndDelete(id).exec();
    await this.recipientModel.deleteMany({ campaignId: campaign._id }).exec();
  }

  /** Detiene una campaña programada o en curso; lo ya enviado, enviado está. */
  async cancel(id: string, tenantId: string): Promise<Campaign> {
    const campaign = await this.load(id, tenantId);
    if (campaign.type === 'whatsapp')
      throw new BadRequestException(
        'Las campañas de WhatsApp no se pueden detener una vez lanzadas',
      );
    if (campaign.status !== 'scheduled' && campaign.status !== 'sending')
      throw new BadRequestException('La campaña no está en curso');
    await this.recipientModel
      .updateMany(
        { campaignId: campaign._id, status: 'pending' },
        { $set: { status: 'skipped', error: 'Campaña detenida' } },
      )
      .exec();
    const stats = await this.sender.countStats(campaign._id);
    campaign.stats = stats;
    campaign.recipientCount = stats.sent;
    // Sin ningún envío vuelve a borrador; con alguno queda como enviada.
    campaign.status = stats.sent > 0 ? 'sent' : 'draft';
    campaign.sentAt = stats.sent > 0 ? new Date() : undefined;
    campaign.scheduledAt = undefined;
    campaign.errorMessage =
      stats.sent > 0 ? `Detenida: ${stats.skipped} sin enviar` : undefined;
    return campaign.save();
  }

  /** Destinatarios de una campaña de email o SMS, con su estado. */
  async recipients(
    id: string,
    tenantId: string,
    opts: { status?: string; page?: number },
  ) {
    const campaign = await this.load(id, tenantId);
    const filter: Record<string, unknown> = { campaignId: campaign._id };
    if (opts.status) filter['status'] = opts.status;
    const size = 100;
    const page = Math.max(1, Math.floor(opts.page ?? 1));
    const [items, total, stats] = await Promise.all([
      this.recipientModel
        .find(filter, {
          name: 1,
          to: 1,
          status: 1,
          error: 1,
          sentAt: 1,
          shortUrl: 1,
          customerId: 1,
        })
        .sort({ _id: 1 })
        .skip((page - 1) * size)
        .limit(size)
        .lean()
        .exec(),
      this.recipientModel.countDocuments(filter),
      this.sender.countStats(campaign._id),
    ]);
    return { items, total, page, pageSize: size, stats };
  }

  /**
   * Cuántos recibirían una campaña con esta audiencia, sin haberla guardado:
   * deduplica, descuenta la lista de no contactar y a quien no tiene el dato
   * del canal (email o teléfono).
   */
  async audiencePreview(
    tenantId: string,
    dto: AudiencePreviewDto,
  ): Promise<{
    total: number;
    reachable: number;
    blocked: number;
    missing: number;
  }> {
    const audience = await this.resolveAudience(
      {
        targeting: dto.targeting,
        recipientTags: dto.recipientTags ?? [],
        listIds: (dto.listIds ?? []).map((i) => new Types.ObjectId(i)),
        customerIds: (dto.customerIds ?? []).map((i) => new Types.ObjectId(i)),
      },
      tenantId,
    );
    const unique = [
      ...new Map(audience.map((c) => [String(c._id), c])).values(),
    ];
    const { allowed, blocked } = await this.suppression.filterAllowed(
      tenantId,
      unique,
    );
    const reachable = allowed.filter((c) =>
      dto.type === 'email' ? !!c.email : !!c.phone,
    ).length;
    return {
      total: unique.length,
      reachable,
      blocked,
      missing: allowed.length - reachable,
    };
  }

  private async load(id: string, tenantId: string): Promise<Campaign> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('Identificador inválido');
    const campaign = await this.campaignModel
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .exec();
    if (!campaign) throw new NotFoundException('Campaña no encontrada');
    return campaign;
  }

  /**
   * Email y SMS: deja a cada destinatario en `campaignrecipients` y devuelve
   * el control. El envío real lo hace `CampaignSenderService` por lotes.
   */
  private async enqueue(
    campaign: Campaign,
    tenantId: string,
  ): Promise<Campaign> {
    const isEmail = campaign.type === 'email';
    const body = campaign.body ?? '';

    if (isEmail) {
      if (campaign.emailTemplateId) {
        const template = await this.emailTemplateModel
          .findOne({
            _id: campaign.emailTemplateId,
            tenantId: campaign.tenantId,
          })
          .lean()
          .exec();
        if (!template)
          throw new BadRequestException(
            'La plantilla de email ya no existe. Elige otra.',
          );
        campaign.html = template.html;
        campaign.preheader = template.preheader;
        if (!campaign.subject?.trim()) campaign.subject = template.subject;
      } else {
        campaign.html = undefined;
        if (!body.trim())
          throw new BadRequestException(
            'Escribe el mensaje o elige una plantilla de email',
          );
      }
      if (campaign.senderAccountId) {
        const account = await this.emailAccounts
          .findOne(String(campaign.senderAccountId), tenantId)
          .catch(() => null);
        if (!account?.active)
          throw new BadRequestException(
            'El buzón remitente no está disponible. Elige otro.',
          );
      }
    } else {
      if (!body.trim())
        throw new BadRequestException('Escribe el mensaje del SMS');
      await this.sms.requireConfig(tenantId);
    }

    const content = `${campaign.subject ?? ''}\n${body}\n${campaign.html ?? ''}`;
    const wantsLink = usesToken(content, 'link');
    if (wantsLink && !campaign.linkUrl)
      throw new BadRequestException(
        'El mensaje usa {link}: indica a qué dirección debe llevar',
      );

    const audience = await this.resolveAudience(campaign, tenantId);
    if (!audience.length)
      throw new BadRequestException('La audiencia elegida no tiene contactos');
    const suppressed = await this.suppression.setFor(tenantId);

    const seenCustomers = new Set<string>();
    const seenAddresses = new Set<string>();
    const rows: {
      _id: Types.ObjectId;
      tenantId: Types.ObjectId;
      campaignId: Types.ObjectId;
      customerId: Types.ObjectId;
      name: string;
      to: string;
      status: 'pending' | 'skipped';
      error?: string;
      shortUrl?: string;
      linkId?: Types.ObjectId;
    }[] = [];
    for (const c of audience) {
      const customerId = String(c._id);
      if (seenCustomers.has(customerId)) continue;
      seenCustomers.add(customerId);

      const to = ((isEmail ? c.email : c.phone) ?? '').trim();
      let status: 'pending' | 'skipped' = 'pending';
      let error: string | undefined;
      if (!to) {
        status = 'skipped';
        error = isEmail ? 'Sin email' : 'Sin teléfono';
      } else if (this.suppression.matches(suppressed, c)) {
        status = 'skipped';
        error = 'En la lista de no contactar';
      } else if (seenAddresses.has(to.toLowerCase())) {
        status = 'skipped';
        error = isEmail ? 'Email repetido' : 'Teléfono repetido';
      } else {
        seenAddresses.add(to.toLowerCase());
      }
      rows.push({
        _id: new Types.ObjectId(),
        tenantId: campaign.tenantId,
        campaignId: campaign._id,
        customerId: c._id,
        name: c.name ?? '',
        to,
        status,
        error,
      });
    }

    const pending = rows.filter((r) => r.status === 'pending');
    if (!pending.length)
      throw new BadRequestException(
        isEmail
          ? 'Ningún contacto de la audiencia puede recibir el correo (sin email o dados de baja)'
          : 'Ningún contacto de la audiencia puede recibir el SMS (sin teléfono o dados de baja)',
      );

    if (wantsLink) {
      const made = await this.links.createPersonalLinks(
        tenantId,
        {
          destination: campaign.linkUrl!,
          domain: campaign.linkDomain,
          channel: isEmail ? 'email' : 'sms',
          campaignId: campaign._id,
          title: campaign.name,
          utm: {
            source: campaign.type,
            medium: 'campaign',
            campaign: campaign.name,
          },
        },
        pending.map((r) => ({ customerId: r.customerId })),
      );
      pending.forEach((r, i) => {
        r.shortUrl = made[i].shortUrl;
        r.linkId = made[i].linkId;
      });
    }

    // Un reenvío parte de cero: los destinatarios del envío anterior se van.
    await this.recipientModel.deleteMany({ campaignId: campaign._id }).exec();
    for (let i = 0; i < rows.length; i += 1000)
      await this.recipientModel.insertMany(rows.slice(i, i + 1000), {
        ordered: false,
      });

    const scheduled =
      !!campaign.scheduledAt && campaign.scheduledAt.getTime() > Date.now();
    campaign.status = scheduled ? 'scheduled' : 'sending';
    campaign.startedAt = scheduled ? undefined : new Date();
    campaign.sentAt = undefined;
    campaign.errorMessage = undefined;
    campaign.recipientCount = pending.length;
    campaign.stats = {
      total: rows.length,
      pending: pending.length,
      sent: 0,
      failed: 0,
      skipped: rows.length - pending.length,
    };
    return campaign.save();
  }

  /**
   * Cuántos recibirían la campaña. Descuenta la lista de no contactar: si el
   * número de la pantalla no coincide con el que se envía, nadie se fía de él.
   */
  async previewCount(
    tenantId: string,
    tags: string[],
  ): Promise<{ count: number; blocked: number }> {
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
    };
    if (tags.length > 0) filter['tags'] = { $in: tags };
    const people = await this.customerModel
      .find(filter, { phone: 1, email: 1 })
      .lean<{ phone?: string; email?: string }[]>()
      .exec();
    const { allowed, blocked } = await this.suppression.filterAllowed(
      tenantId,
      people,
    );
    return { count: allowed.length, blocked };
  }

  async estimate(
    id: string,
    tenantId: string,
  ): Promise<{
    recipientCount: number;
    estimatedMinutes: number;
    dailyLimit: number;
    sentToday: number;
    remaining: number;
    cloudApiPricePerMsg?: number;
    /** Solo SMS: partes en que se divide el mensaje (sin variables resueltas). */
    smsSegments?: number;
  }> {
    const campaign = await this.campaignModel.findById(id).exec();
    if (!campaign) throw new NotFoundException('Campaña no encontrada');
    if (campaign.tenantId.toString() !== tenantId)
      throw new ForbiddenException();

    const customers = await this.resolveCustomers(campaign, tenantId);
    if (campaign.type !== 'whatsapp') {
      const isEmail = campaign.type === 'email';
      const reachable = new Set(
        customers
          .map((c) =>
            ((isEmail ? c.email : c.phone) ?? '').trim().toLowerCase(),
          )
          .filter(Boolean),
      ).size;
      const perMinute = isEmail
        ? campaign.senderAccountId
          ? 60
          : ((await this.resendAccounts.mailer(tenantId).catch(() => null))
              ?.ratePerMinute ?? 60)
        : Math.min(
            (await this.sms.getConfig(tenantId)).ratePerMinute || 60,
            120,
          );
      return {
        recipientCount: reachable,
        estimatedMinutes: Math.ceil(reachable / perMinute),
        dailyLimit: 0,
        sentToday: 0,
        remaining: reachable,
        ...(isEmail
          ? {}
          : { smsSegments: smsSegments(campaign.body ?? '').segments }),
      };
    }
    const withPhone = customers.filter((c) => c.phone);
    const recipientCount = withPhone.length;

    if (campaign.waProvider === 'cloudapi') {
      return {
        recipientCount,
        estimatedMinutes: 0,
        dailyLimit: 0,
        sentToday: 0,
        remaining: recipientCount,
        cloudApiPricePerMsg: 0.0625,
      };
    }

    const dailyLimit = await this.settings.getWaDailyLimit(tenantId);
    const sentToday =
      campaign.type === 'whatsapp' ? await this.countWaSentToday(tenantId) : 0;
    const remaining = Math.max(0, dailyLimit - sentToday);
    const willSend =
      campaign.type === 'whatsapp'
        ? Math.min(recipientCount, remaining)
        : recipientCount;
    const estimatedMinutes = Math.ceil((willSend * 45) / 60);

    return {
      recipientCount,
      estimatedMinutes,
      dailyLimit,
      sentToday,
      remaining,
    };
  }

  async send(id: string, tenantId: string): Promise<Campaign> {
    const campaign = await this.campaignModel.findById(id).exec();
    if (!campaign) throw new NotFoundException('Campaña no encontrada');
    if (campaign.tenantId.toString() !== tenantId)
      throw new ForbiddenException();
    if (campaign.status === 'sent')
      throw new BadRequestException('La campaña ya fue enviada');
    if (campaign.status === 'sending' || campaign.status === 'scheduled')
      throw new BadRequestException('La campaña ya está en proceso de envío');

    // Email y SMS no se envían dentro de la petición: se encolan.
    if (campaign.type !== 'whatsapp') return this.enqueue(campaign, tenantId);

    const customers = await this.resolveCustomers(campaign, tenantId);
    campaign.status = 'sending';
    campaign.recipientCount = customers.length;
    await campaign.save();

    if (campaign.waProvider === 'cloudapi') {
      // Cloud API: parallel, no daily limit
      const withPhone = customers.filter(
        (c): c is Customer & { phone: string } => !!c.phone,
      );
      campaign.recipientCount = withPhone.length;

      let results: PromiseSettledResult<void>[];
      if (campaign.templateName) {
        // Una sola consulta por campaña: la cabecera es igual para todos.
        const header = await this.templates.resolveSendHeader(
          tenantId,
          campaign.templateName,
          campaign.mediaUrl,
        );
        results = await Promise.allSettled(
          withPhone.map((c) =>
            this.settings.sendWhatsAppTemplate(
              c.phone,
              campaign.templateName!,
              campaign.templateLanguage ?? 'es',
              (campaign.templateVars ?? []).map((v) => fillTokens(v, c)),
              tenantId,
              header?.text
                ? { ...header, text: fillTokens(header.text, c) }
                : header,
            ),
          ),
        );
      } else {
        results = await Promise.allSettled(
          withPhone.map((c) =>
            this.settings.sendWhatsApp(
              c.phone,
              fillTokensMultiline(campaign.body ?? '', c),
              tenantId,
              campaign.mediaUrl,
              campaign.mediaType,
              'cloudapi',
            ),
          ),
        );
      }

      const failed = results.filter((r) => r.status === 'rejected').length;
      const firstError: unknown = results.find(
        (r) => r.status === 'rejected',
      )?.reason;
      campaign.status = 'sent';
      campaign.sentAt = new Date();

      const errors: string[] = [];
      if (failed > 0)
        errors.push(
          `${failed} mensaje(s) fallaron${firstError ? ': ' + stringifyError(firstError) : ''}`,
        );
      if (customers.length - withPhone.length > 0)
        errors.push(
          `${customers.length - withPhone.length} sin teléfono (omitidos)`,
        );
      if (errors.length > 0) campaign.errorMessage = errors.join(' · ');
    } else {
      // WAHA: sequential + daily limit — processed async to avoid HTTP timeout
      const withPhone = customers.filter(
        (c): c is Customer & { phone: string } => !!c.phone,
      );
      const dailyLimit = await this.settings.getWaDailyLimit(tenantId);
      const sentToday = await this.countWaSentToday(tenantId);
      const remaining = Math.max(0, dailyLimit - sentToday);

      if (remaining <= 0) {
        campaign.status = 'sent';
        campaign.sentAt = new Date();
        campaign.errorMessage = `Límite diario de ${dailyLimit} mensajes WA alcanzado. No se envió ningún mensaje.`;
        return campaign.save();
      }

      const toSend = withPhone.slice(0, remaining);
      const noPhone = customers.length - withPhone.length;
      const skippedByLimit = withPhone.length - toSend.length;
      campaign.recipientCount = toSend.length;
      await campaign.save();

      // Fire-and-forget: process in background so HTTP response returns immediately
      void this.runWahaQueue(
        campaign._id.toString(),
        toSend,
        tenantId,
        campaign.body ?? '',
        campaign.mediaUrl,
        campaign.mediaType,
        noPhone,
        skippedByLimit,
      );

      return campaign;
    }

    return campaign.save();
  }

  /**
   * Audiencia de la campaña, ya SIN quien pidió no recibir comunicaciones.
   *
   * El descarte va aquí y no en cada rama: por aquí pasan las tres formas de
   * segmentar (todos, listas, etiquetas), así que ninguna se lo puede saltar.
   */
  private async resolveCustomers(
    campaign: Campaign,
    tenantId: string,
  ): Promise<Customer[]> {
    const audience = await this.resolveAudience(campaign, tenantId);
    const { allowed, blocked } = await this.suppression.filterAllowed(
      tenantId,
      audience,
    );
    if (blocked > 0)
      this.logger.log(
        `Campaña ${String(campaign._id)}: ${blocked} contacto(s) en la lista de no contactar quedaron fuera.`,
      );
    return allowed;
  }

  /** La audiencia bruta, tal como la define la segmentación de la campaña. */
  private async resolveAudience(
    campaign: Pick<
      Campaign,
      'targeting' | 'listIds' | 'recipientTags' | 'customerIds'
    >,
    tenantId: string,
  ): Promise<Customer[]> {
    const tid = new Types.ObjectId(tenantId);
    if (campaign.targeting === 'contacts') {
      if (!campaign.customerIds?.length) return [];
      return this.customerModel
        .find({ tenantId: tid, _id: { $in: campaign.customerIds } })
        .lean<Customer[]>()
        .exec();
    }
    if (campaign.targeting === 'lists' && campaign.listIds?.length > 0) {
      return this.lists.resolveCustomers(
        campaign.listIds.map((id) => id.toString()),
        tenantId,
      );
    }
    if (campaign.targeting === 'all') {
      return this.customerModel
        .find({ tenantId: tid })
        .lean<Customer[]>()
        .exec();
    }
    const filter: Record<string, unknown> = { tenantId: tid };
    if (campaign.recipientTags.length > 0)
      filter['tags'] = { $in: campaign.recipientTags };
    return this.customerModel.find(filter).lean<Customer[]>().exec();
  }

  async generateEmail(dto: {
    topic: string;
    tone?: string;
  }): Promise<{ subject: string; body: string }> {
    const toneMap: Record<string, string> = {
      amigable: 'amigable y cercano, como si hablaras con un amigo',
      profesional: 'profesional y formal',
      exclusivo: 'exclusivo y premium, dirigido a clientes de alto valor',
      urgente:
        'urgente con fuerte llamada a la acción, generando sensación de escasez',
    };
    const toneDesc = toneMap[dto.tone ?? 'amigable'] ?? 'amigable y cercano';
    const prompt = `Eres un experto en email marketing para restaurantes y negocios de hospitalidad premium en Latinoamérica.
Genera un email de campaña en español con este contexto:
- Tema / oferta: ${dto.topic}
- Tono: ${toneDesc}

Reglas:
- Usa {nombre} como variable de personalización al inicio (ej: "Hola {nombre},")
- El body es texto plano, sin etiquetas HTML
- Párrafos separados por una línea en blanco
- Máximo 200 palabras
- Incluye una llamada a la acción clara
- Firma genérica al final (sin datos reales)

Responde ÚNICAMENTE con JSON válido sin texto adicional:
{"subject": "...", "body": "..."}`;

    const text = await this.ai.chat(prompt, { maxTokens: 700 });
    return this.ai.parseJson<{ subject: string; body: string }>(text);
  }

  private async runWahaQueue(
    campaignId: string,

    toSend: (Customer & { phone: string })[],
    tenantId: string,
    body: string,
    mediaUrl: string | undefined,
    mediaType: string | undefined,
    noPhone: number,
    skippedByLimit: number,
  ): Promise<void> {
    const results: PromiseSettledResult<void>[] = [];
    for (let i = 0; i < toSend.length; i++) {
      const c = toSend[i];
      const result = await Promise.allSettled([
        this.settings.sendWhatsApp(
          c.phone,
          fillTokensMultiline(body, c),
          tenantId,
          mediaUrl,
          mediaType as 'image' | 'video' | 'audio' | 'document' | undefined,
          'waha',
        ),
      ]);
      results.push(result[0]);

      if (result[0].status === 'rejected') {
        this.logger.error(`WA failed for ${c.phone}: ${result[0].reason}`);
      }

      if (i < toSend.length - 1) {
        const delay = 30000 + Math.floor(Math.random() * 30000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    const campaign = await this.campaignModel.findById(campaignId).exec();
    if (!campaign) return;

    const failed = results.filter((r) => r.status === 'rejected').length;
    const firstError: unknown = results.find(
      (r) => r.status === 'rejected',
    )?.reason;
    campaign.status = 'sent';
    campaign.sentAt = new Date();

    const errors: string[] = [];
    if (failed > 0)
      errors.push(
        `${failed} mensaje(s) fallaron${firstError ? ': ' + stringifyError(firstError) : ''}`,
      );
    if (noPhone > 0) errors.push(`${noPhone} sin teléfono (omitidos)`);
    if (skippedByLimit > 0)
      errors.push(`${skippedByLimit} omitidos por límite diario`);
    if (errors.length > 0) campaign.errorMessage = errors.join(' · ');

    await campaign.save();
  }

  private async countWaSentToday(tenantId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    // Cuenta lo enviado hoy Y lo que está en vuelo: una campaña 'sending'
    // ya reservó su cuota aunque todavía no tenga sentAt.
    const campaigns = await this.campaignModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        type: 'whatsapp',
        $or: [
          { status: 'sent', sentAt: { $gte: startOfDay } },
          { status: 'sending' },
        ],
      })
      .exec();
    return campaigns.reduce((sum, c) => sum + (c.recipientCount ?? 0), 0);
  }
}

/** Convierte el reason de una promesa rechazada a texto legible. */
function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return JSON.stringify(err);
}
