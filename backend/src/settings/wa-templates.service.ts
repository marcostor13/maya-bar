import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WaTemplate } from './wa-template.schema';
import { TenantConfig } from './tenant-config.schema';
import { CreateWaTemplateDto } from './dto/wa-template.dto';

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
    @InjectModel(TenantConfig.name) private configModel: Model<TenantConfig>,
  ) {}

  async findAll(tenantId: string): Promise<WaTemplate[]> {
    return this.templateModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ name: 1 })
      .exec();
  }

  async sync(tenantId: string): Promise<WaTemplate[]> {
    const config = await this.getConfig(tenantId);
    const token = config?.waAccessToken?.trim();
    const wabaId = config?.waBusinessAccountId?.trim();
    if (!token || !wabaId) {
      throw new BadRequestException(
        'Configura el Access Token y el WABA ID en Cloud API primero',
      );
    }
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${wabaId}/message_templates?limit=100`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok)
      throw new BadRequestException(
        `Meta API ${res.status}: ${await res.text()}`,
      );
    const data = (await res.json()) as { data?: MetaTemplate[] };
    const tid = new Types.ObjectId(tenantId);
    const results: WaTemplate[] = [];
    for (const t of data.data ?? []) {
      const body = t.components?.find((c) => c.type === 'BODY')?.text ?? '';
      const header = t.components?.find((c) => c.type === 'HEADER');
      const footer = t.components?.find((c) => c.type === 'FOOTER')?.text;
      const doc = await this.templateModel
        .findOneAndUpdate(
          { tenantId: tid, metaId: t.id },
          {
            tenantId: tid,
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
      results.push(doc);
    }
    return results;
  }

  async create(
    tenantId: string,
    dto: CreateWaTemplateDto,
  ): Promise<WaTemplate> {
    const config = await this.getConfig(tenantId);
    if (!config?.waAccessToken || !config?.waBusinessAccountId) {
      throw new BadRequestException(
        'Configura el Access Token y el WABA ID en Cloud API primero',
      );
    }
    const components: MetaComponent[] = [];
    if (dto.headerText)
      components.push({ type: 'HEADER', format: 'TEXT', text: dto.headerText });
    components.push({ type: 'BODY', text: dto.body });
    if (dto.footer) components.push({ type: 'FOOTER', text: dto.footer });

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${config.waBusinessAccountId}/message_templates`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.waAccessToken}`,
        },
        body: JSON.stringify({
          name: dto.name,
          category: dto.category,
          language: dto.language,
          components,
        }),
      },
    );
    if (!res.ok)
      throw new BadRequestException(
        `Meta API ${res.status}: ${await res.text()}`,
      );
    const created = (await res.json()) as { id: string };
    const tid = new Types.ObjectId(tenantId);
    return this.templateModel.create({
      tenantId: tid,
      metaId: created.id,
      name: dto.name,
      category: dto.category,
      language: dto.language,
      status: 'PENDING',
      body: dto.body,
      headerText: dto.headerText,
      footer: dto.footer,
      rawComponents: components,
    });
  }

  async remove(tenantId: string, templateId: string): Promise<void> {
    const template = await this.templateModel.findById(templateId).exec();
    if (!template || template.tenantId.toString() !== tenantId)
      throw new NotFoundException();
    const config = await this.getConfig(tenantId);
    if (config?.waAccessToken && template.metaId) {
      await fetch(
        `https://graph.facebook.com/v19.0/${config.waBusinessAccountId}/message_templates?name=${template.name}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${config.waAccessToken}` },
        },
      ).catch(() => {});
    }
    await this.templateModel.findByIdAndDelete(templateId).exec();
  }

  private async getConfig(tenantId: string): Promise<TenantConfig | null> {
    return this.configModel
      .findOne({ tenantId: new Types.ObjectId(tenantId) })
      .exec();
  }
}
