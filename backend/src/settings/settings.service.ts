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

  async getWaDailyLimit(tenantId: string): Promise<number> {
    const doc = await this.get(tenantId);
    return doc?.waDailyLimit ?? 50;
  }

  async getWaStatus(tenantId: string): Promise<WaStatus> {
    const config = await this.resolveConfig(tenantId);
    return this.wa.getStatus(config);
  }

  async getWaQr(
    tenantId: string,
  ): Promise<{ qrcode?: string; error?: string }> {
    const config = await this.resolveConfig(tenantId);
    return this.wa.getQr(config);
  }

  async sendWhatsApp(
    to: string,
    body: string,
    tenantId: string,
    mediaUrl?: string,
    mediaType?: WaMediaType,
    forceProvider?: string,
  ): Promise<void> {
    const config = await this.resolveConfig(tenantId);
    if (forceProvider) config.provider = forceProvider;
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

  async testWaha(
    tenantId: string,
    phone: string,
  ): Promise<{
    success: boolean;
    provider: string;
    wahaApiUrl?: string;
    wahaSession?: string;
    formattedPhone: string;
    error?: string;
  }> {
    const config = await this.resolveConfig(tenantId);
    // Always force waha for this test — credentials come from DB regardless of global provider
    config.provider = 'waha';
    const formattedPhone = this.wa.formatPhone(phone);
    if (!formattedPhone) {
      return {
        success: false,
        provider: 'waha',
        wahaApiUrl: config.wahaApiUrl,
        wahaSession: config.wahaSession,
        formattedPhone: phone,
        error: 'Número inválido (< 8 dígitos)',
      };
    }
    if (!config.wahaApiUrl) {
      return {
        success: false,
        provider: 'waha',
        wahaApiUrl: config.wahaApiUrl,
        wahaSession: config.wahaSession,
        formattedPhone,
        error:
          'URL de WAHA no configurada en la sección WAHA. Guarda la configuración primero.',
      };
    }
    try {
      await this.wa.sendMessage(
        formattedPhone,
        '✅ Mensaje de prueba desde Maya CRM',
        config,
      );
      return {
        success: true,
        provider: 'waha',
        wahaApiUrl: config.wahaApiUrl,
        wahaSession: config.wahaSession,
        formattedPhone,
      };
    } catch (err) {
      return {
        success: false,
        provider: 'waha',
        wahaApiUrl: config.wahaApiUrl,
        wahaSession: config.wahaSession,
        formattedPhone,
        error: String(err),
      };
    }
  }

  /**
   * Una plantilla vive en el WABA de una cuenta Cloud API concreta y solo se
   * puede enviar desde esa cuenta. La predeterminada puede ser de WAHA (sin
   * phone_number_id) o de otro número (Meta responde "template not found"),
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
      provider: doc?.whatsappProvider ?? 'none',
      wahaApiUrl: doc?.wahaApiUrl,
      wahaApiKey: doc?.wahaApiKey,
      wahaSession: doc?.wahaSession ?? 'default',
      waPhoneNumberId: doc?.waPhoneNumberId,
      waAccessToken: doc?.waAccessToken,
    };
  }
}
