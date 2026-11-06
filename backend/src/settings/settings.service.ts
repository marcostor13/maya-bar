import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TenantConfig } from './tenant-config.schema';
import { SaveSettingsDto } from './dto/settings.dto';
import {
  WhatsAppService,
  WaConfig,
  WaStatus,
  WaMediaType,
  type TemplateHeader,
} from '../whatsapp/whatsapp.service';
import { WhatsAppAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { WaTemplate } from '../whatsapp-templates/wa-template.schema';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(TenantConfig.name) private configModel: Model<TenantConfig>,
    private wa: WhatsAppService,
    private accounts: WhatsAppAccountsService,
    @InjectModel(WaTemplate.name) private templateModel: Model<WaTemplate>,
  ) {}

  async get(tenantId: string): Promise<TenantConfig | null> {
    return this.configModel
      .findOne({ tenantId: new Types.ObjectId(tenantId) })
      .exec();
  }

  async save(tenantId: string, dto: SaveSettingsDto): Promise<TenantConfig> {
    const tid = new Types.ObjectId(tenantId);
    const doc = await this.configModel
      .findOneAndUpdate(
        { tenantId: tid },
        { $set: { tenantId: tid, ...dto } },
        { upsert: true, new: true },
      )
      .exec();
    return doc;
  }

  async getWaStatus(tenantId: string): Promise<WaStatus> {
    const config = await this.resolveConfig(tenantId);
    return this.wa.getStatus(config);
  }

  async sendWhatsApp(
    to: string,
    body: string,
    tenantId: string,
    mediaUrl?: string,
    mediaType?: WaMediaType,
  ): Promise<void> {
    const config = await this.resolveConfig(tenantId);
    await this.wa.sendMessage(to, body, config, mediaUrl, mediaType);
  }

  async sendWhatsAppTemplate(
    to: string,
    templateName: string,
    templateLang: string,
    vars: string[],
    tenantId: string,
    header?: TemplateHeader,
  ): Promise<void> {
    const config = await this.resolveTemplateConfig(
      tenantId,
      templateName,
      templateLang,
    );
    return this.wa.sendCloudApiTemplate(
      to,
      templateName,
      templateLang,
      vars,
      config,
      header,
    );
  }

  /**
   * Una plantilla vive en el WABA de una cuenta Cloud API concreta y solo se
   * puede enviar desde esa cuenta. La predeterminada puede ser de otro número (Meta responde "template not found"),
   * así que se usa la predeterminada solo si es la dueña de la plantilla.
   */
  private async resolveTemplateConfig(
    tenantId: string,
    templateName: string,
    templateLang: string,
  ): Promise<WaConfig> {
    const owners = await this.templateModel
      .find({ tenantId: new Types.ObjectId(tenantId), name: templateName })
      .exec();
    if (owners.length > 0) {
      const def = await this.accounts.getDefault(tenantId);
      if (
        def?.provider === 'cloudapi' &&
        owners.some((t) => String(t.accountId) === String(def._id))
      )
        return this.accounts.toConfig(def);
      const owner =
        owners.find((t) => t.language === templateLang) ?? owners[0];
      const account = await this.accounts
        .findOne(String(owner.accountId), tenantId)
        .catch(() => null);
      if (account?.active && account.provider === 'cloudapi')
        return this.accounts.toConfig(account);
    }
    return this.resolveConfig(tenantId);
  }

  private async resolveConfig(tenantId: string): Promise<WaConfig> {
    // Fuente principal: cuenta predeterminada del tenant.
    const account = await this.accounts.getDefault(tenantId);
    if (account) return this.accounts.toConfig(account);
    // Fallback legacy: config única de TenantConfig.
    const doc = await this.get(tenantId);
    return {
      provider: doc?.whatsappProvider === 'cloudapi' ? 'cloudapi' : 'none',
      waPhoneNumberId: doc?.waPhoneNumberId,
      waAccessToken: doc?.waAccessToken,
    };
  }
}
