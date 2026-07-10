import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Campaign } from './campaign.schema';
import { Customer } from '../customers/customer.schema';
import { MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';
import { ListsService } from '../lists/lists.service';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';
import { AiService } from '../ai/ai.service';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    @InjectModel(Campaign.name) private campaignModel: Model<Campaign>,
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
    private mail: MailService,
    private settings: SettingsService,
    private lists: ListsService,
    private ai: AiService,
  ) {}

  async findAll(tenantId: string): Promise<Campaign[]> {
    return this.campaignModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async create(tenantId: string, dto: CreateCampaignDto): Promise<Campaign> {
    const campaign = new this.campaignModel({
      ...dto,
      tenantId: new Types.ObjectId(tenantId),
      targeting: dto.targeting ?? 'tags',
      recipientTags: dto.recipientTags ?? [],
      listIds: (dto.listIds ?? []).map((id) => new Types.ObjectId(id)),
    });
    return campaign.save();
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
    Object.assign(campaign, dto);
    return campaign.save();
  }

  async resend(id: string, tenantId: string): Promise<Campaign> {
    const campaign = await this.campaignModel.findById(id).exec();
    if (!campaign) throw new NotFoundException('Campaña no encontrada');
    if (campaign.tenantId.toString() !== tenantId)
      throw new ForbiddenException();
    if (campaign.status === 'sending')
      throw new BadRequestException('La campaña ya está en proceso de envío');
    campaign.status = 'draft';
    campaign.errorMessage = undefined;
    campaign.sentAt = undefined;
    await campaign.save();
    return this.send(id, tenantId);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const campaign = await this.campaignModel.findById(id).exec();
    if (!campaign) throw new NotFoundException('Campaña no encontrada');
    if (campaign.tenantId.toString() !== tenantId)
      throw new ForbiddenException();
    await this.campaignModel.findByIdAndDelete(id).exec();
  }

  async previewCount(
    tenantId: string,
    tags: string[],
  ): Promise<{ count: number }> {
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
    };
    if (tags.length > 0) filter['tags'] = { $in: tags };
    const count = await this.customerModel.countDocuments(filter);
    return { count };
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
  }> {
    const campaign = await this.campaignModel.findById(id).exec();
    if (!campaign) throw new NotFoundException('Campaña no encontrada');
    if (campaign.tenantId.toString() !== tenantId)
      throw new ForbiddenException();

    const customers = await this.resolveCustomers(campaign, tenantId);
    const withPhone =
      campaign.type === 'whatsapp'
        ? customers.filter((c) => c.phone)
        : customers;
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
    if (campaign.status === 'sending')
      throw new BadRequestException('La campaña ya está en proceso de envío');

    const customers = await this.resolveCustomers(campaign, tenantId);
    campaign.status = 'sending';
    campaign.recipientCount = customers.length;
    await campaign.save();

    if (campaign.type === 'email') {
      const results = await Promise.allSettled(
        customers.map((c) =>
          this.mail.sendCampaign({
            to: c.email,
            name: c.name,
            subject: campaign.subject ?? campaign.name,
            body: campaign.body.replace(/\{nombre\}/gi, c.name),
            mediaUrl: campaign.mediaUrl,
            mediaType:
              campaign.mediaType === 'image' || campaign.mediaType === 'video'
                ? campaign.mediaType
                : undefined,
          }),
        ),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      campaign.status = 'sent';
      campaign.sentAt = new Date();
      if (failed > 0)
        campaign.errorMessage = `${failed} email(s) no se pudieron enviar`;
    } else if (campaign.waProvider === 'cloudapi') {
      // Cloud API: parallel, no daily limit
      const withPhone = customers.filter(
        (c): c is Customer & { phone: string } => !!c.phone,
      );
      campaign.recipientCount = withPhone.length;

      let results: PromiseSettledResult<void>[];
      if (campaign.templateName) {
        results = await Promise.allSettled(
          withPhone.map((c) =>
            this.settings.sendWhatsAppTemplate(
              c.phone,
              campaign.templateName!,
              campaign.templateLanguage ?? 'es',
              (campaign.templateVars ?? []).map((v) =>
                v.replace(/\{nombre\}/gi, c.name),
              ),
              tenantId,
            ),
          ),
        );
      } else {
        results = await Promise.allSettled(
          withPhone.map((c) =>
            this.settings.sendWhatsApp(
              c.phone,
              campaign.body.replace(/\{nombre\}/gi, c.name),
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
        campaign.body,
        campaign.mediaUrl,
        campaign.mediaType,
        noPhone,
        skippedByLimit,
      );

      return campaign;
    }

    return campaign.save();
  }

  private async resolveCustomers(
    campaign: Campaign,
    tenantId: string,
  ): Promise<Customer[]> {
    const tid = new Types.ObjectId(tenantId);
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
          body.replace(/\{nombre\}/gi, c.name),
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
    const campaigns = await this.campaignModel
      .find({
        tenantId: new Types.ObjectId(tenantId),
        type: 'whatsapp',
        status: 'sent',
        sentAt: { $gte: startOfDay },
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
