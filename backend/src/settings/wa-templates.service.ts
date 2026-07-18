import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WaTemplate } from './wa-template.schema';
import { CreateWaTemplateDto } from './dto/wa-template.dto';
import { MetaGraphClient, MetaApiError } from '../shared/meta-graph.client';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { WhatsAppAccount } from '../whatsapp-accounts/whatsapp-account.schema';

interface MetaComponent {
  type: string;
  format?: string;
  text?: string;
  [key: string]: unknown;
}

interface MetaTemplate {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  components: MetaComponent[];
}

@Injectable()
export class WaTemplatesService {
  constructor(
    @InjectModel(WaTemplate.name) private templateModel: Model<WaTemplate>,
    private readonly graph: MetaGraphClient,
    private readonly accounts: WhatsAppAccountsService,
  ) {}

  async findAll(tenantId: string): Promise<WaTemplate[]> {
    return this.templateModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ accountLabel: 1, name: 1 })
      .exec();
  }

  /** Cuentas Cloud API vinculadas y activas con credenciales completas. */
  private async cloudAccounts(tenantId: string): Promise<WhatsAppAccount[]> {
    const all = await this.accounts.findAll(tenantId);
    return all.filter(
      (a) =>
        a.provider === 'cloudapi' &&
        a.active &&
        !!a.waAccessToken?.trim() &&
        !!a.waBusinessAccountId?.trim(),
    );
  }

  /** Sincroniza las plantillas de Meta de TODAS las cuentas Cloud API vinculadas. */
  async sync(tenantId: string): Promise<WaTemplate[]> {
    const accounts = await this.cloudAccounts(tenantId);
    if (accounts.length === 0) {
      throw new BadRequestException(
        'Vincula al menos una cuenta de WhatsApp Cloud API primero',
      );
    }
    const tid = new Types.ObjectId(tenantId);
    for (const account of accounts) {
      const data = await this.metaRequest<{ data?: MetaTemplate[] }>(() =>
        this.graph.get(`/${account.waBusinessAccountId}/message_templates`, {
          accessToken: account.waAccessToken as string,
          params: { limit: '100' },
        }),
      );
      for (const t of data.data ?? []) {
        const body = t.components?.find((c) => c.type === 'BODY')?.text ?? '';
        const header = t.components?.find((c) => c.type === 'HEADER');
        const footer = t.components?.find((c) => c.type === 'FOOTER')?.text;
        await this.templateModel
          .findOneAndUpdate(
            { tenantId: tid, accountId: account._id, metaId: t.id },
            {
              tenantId: tid,
              accountId: account._id,
              accountLabel: account.label,
              wabaId: account.waBusinessAccountId,
              metaId: t.id,
              name: t.name,
              category: t.category,
              language: t.language,
              status: t.status,
              body,
              headerType: header?.format,
              headerText: header?.text,
              footer,
              rawComponents: t.components,
            },
            { upsert: true, new: true },
          )
          .exec();
      }
    }
    // Elimina plantillas huérfanas (cuentas desvinculadas o registros heredados sin accountId).
    const accountIds = accounts.map((a) => a._id);
    await this.templateModel
      .deleteMany({ tenantId: tid, accountId: { $nin: accountIds } })
      .exec();
    return this.findAll(tenantId);
  }

  /** Crea la plantilla en Meta para TODAS las cuentas Cloud API vinculadas. */
  async create(
    tenantId: string,
    dto: CreateWaTemplateDto,
  ): Promise<WaTemplate[]> {
    const accounts = await this.cloudAccounts(tenantId);
    if (accounts.length === 0) {
      throw new BadRequestException(
        'Vincula al menos una cuenta de WhatsApp Cloud API primero',
      );
    }
    const components: MetaComponent[] = [];
    if (dto.headerText)
      components.push({ type: 'HEADER', format: 'TEXT', text: dto.headerText });
    components.push({ type: 'BODY', text: dto.body });
    if (dto.footer) components.push({ type: 'FOOTER', text: dto.footer });

    const tid = new Types.ObjectId(tenantId);
    const created: WaTemplate[] = [];
    const errors: string[] = [];
    for (const account of accounts) {
      try {
        const res = await this.metaRequest<{ id: string }>(() =>
          this.graph.post(`/${account.waBusinessAccountId}/message_templates`, {
            accessToken: account.waAccessToken as string,
            json: {
              name: dto.name,
              category: dto.category,
              language: dto.language,
              components,
            },
          }),
        );
        const doc = await this.templateModel.create({
          tenantId: tid,
          accountId: account._id,
          accountLabel: account.label,
          wabaId: account.waBusinessAccountId,
          metaId: res.id,
          name: dto.name,
          category: dto.category,
          language: dto.language,
          status: 'PENDING',
          body: dto.body,
          headerText: dto.headerText,
          footer: dto.footer,
          rawComponents: components,
        });
        created.push(doc);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${account.label}: ${msg}`);
      }
    }
    if (created.length === 0) {
      throw new BadRequestException(
        errors.join('; ') || 'No se pudo crear la plantilla',
      );
    }
    return created;
  }

  async remove(tenantId: string, templateId: string): Promise<void> {
    const template = await this.templateModel.findById(templateId).exec();
    if (!template || template.tenantId.toString() !== tenantId)
      throw new NotFoundException();
    const account = template.accountId
      ? await this.accounts
          .findOne(template.accountId.toString(), tenantId)
          .catch(() => null)
      : null;
    if (
      account?.waAccessToken &&
      account.waBusinessAccountId &&
      template.metaId
    ) {
      await this.graph
        .delete(`/${account.waBusinessAccountId}/message_templates`, {
          accessToken: account.waAccessToken,
          params: { name: template.name },
        })
        .catch(() => {});
    }
    await this.templateModel.findByIdAndDelete(templateId).exec();
  }

  /** Traduce errores de Meta a BadRequestException conservando status y mensaje. */
  private async metaRequest<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (err) {
      if (err instanceof MetaApiError)
        throw new BadRequestException(`Meta API ${err.status}: ${err.message}`);
      throw err;
    }
  }
}
