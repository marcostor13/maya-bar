import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { WhatsAppAccount } from './whatsapp-account.schema';
import {
  CreateWhatsAppAccountDto,
  UpdateWhatsAppAccountDto,
} from './dto/whatsapp-account.dto';
import {
  WhatsAppService,
  WaConfig,
  WaStatus,
} from '../whatsapp/whatsapp.service';
import {
  WhatsAppOAuthService,
  WaOAuthPublicConfig,
} from '../whatsapp/whatsapp-oauth.service';

@Injectable()
export class WhatsAppAccountsService {
  constructor(
    @InjectModel(WhatsAppAccount.name) private model: Model<WhatsAppAccount>,
    private wa: WhatsAppService,
    private oauth: WhatsAppOAuthService,
    private config: ConfigService,
  ) {}

  /** URL pública a la que WAHA/Cloud debe reenviar los mensajes entrantes. */
  private webhookUrlFor(account: WhatsAppAccount): string | undefined {
    const base = this.config.get<string>('PUBLIC_API_URL');
    if (!base) return undefined;
    const kind = account.provider === 'waha' ? 'waha' : 'cloud';
    return `${base.replace(/\/$/, '')}/wa/webhook/${kind}/${String(account._id)}`;
  }

  findAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string, tenantId: string): Promise<WhatsAppAccount> {
    const doc = await this.model
      .findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
      })
      .exec();
    if (!doc) throw new NotFoundException('Cuenta de WhatsApp no encontrada');
    return doc;
  }

  /** Solo por id (uso interno, p.ej. webhooks). */
  findById(id: string) {
    return this.model.findById(new Types.ObjectId(id)).exec();
  }

  async create(tenantId: string, dto: CreateWhatsAppAccountDto) {
    const tid = new Types.ObjectId(tenantId);
    const count = await this.model.countDocuments({ tenantId: tid }).exec();
    return this.model.create({
      ...dto,
      tenantId: tid,
      isDefault: count === 0, // la primera cuenta del tenant queda como predeterminada
    });
  }

  /** Cuenta predeterminada del tenant (para campañas y envíos salientes). */
  async getDefault(tenantId: string): Promise<WhatsAppAccount | null> {
    const tid = new Types.ObjectId(tenantId);
    return (
      (await this.model
        .findOne({ tenantId: tid, isDefault: true, active: true })
        .exec()) ??
      (await this.model
        .findOne({ tenantId: tid, active: true })
        .sort({ createdAt: 1 })
        .exec())
    );
  }

  /** Marca una cuenta como predeterminada y desmarca el resto. */
  async setDefault(id: string, tenantId: string): Promise<WhatsAppAccount> {
    const tid = new Types.ObjectId(tenantId);
    const account = await this.findOne(id, tenantId);
    await this.model
      .updateMany({ tenantId: tid }, { $set: { isDefault: false } })
      .exec();
    account.isDefault = true;
    await account.save();
    return account;
  }

  async update(id: string, tenantId: string, dto: UpdateWhatsAppAccountDto) {
    const doc = await this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId: new Types.ObjectId(tenantId) },
        { $set: dto },
        { new: true },
      )
      .exec();
    if (!doc) throw new NotFoundException('Cuenta de WhatsApp no encontrada');
    return doc;
  }

  async remove(id: string, tenantId: string) {
    const tid = new Types.ObjectId(tenantId);
    const account = await this.model
      .findOne({ _id: new Types.ObjectId(id), tenantId: tid })
      .exec();
    if (!account)
      throw new NotFoundException('Cuenta de WhatsApp no encontrada');
    await this.model.deleteOne({ _id: account._id }).exec();
    // si era la predeterminada, promueve otra
    if (account.isDefault) {
      const next = await this.model
        .findOne({ tenantId: tid })
        .sort({ createdAt: 1 })
        .exec();
      if (next) {
        next.isDefault = true;
        await next.save();
      }
    }
    return { deleted: true };
  }

  /** Convierte un documento de cuenta en la WaConfig que entiende WhatsAppService. */
  toConfig(account: WhatsAppAccount): WaConfig {
    return {
      provider: account.provider,
      wahaApiUrl: account.wahaApiUrl,
      wahaApiKey: account.wahaApiKey,
      wahaSession: account.wahaSession ?? 'default',
      waPhoneNumberId: account.waPhoneNumberId,
      waAccessToken: account.waAccessToken,
      waBusinessAccountId: account.waBusinessAccountId,
    };
  }

  async status(id: string, tenantId: string): Promise<WaStatus> {
    const account = await this.findOne(id, tenantId);
    return this.wa.getStatus(this.toConfig(account));
  }

  async qr(id: string, tenantId: string) {
    const account = await this.findOne(id, tenantId);
    const config = this.toConfig(account);
    config.webhookUrl = this.webhookUrlFor(account);
    return this.wa.getQr(config);
  }

  async configureWebhook(id: string, tenantId: string) {
    const account = await this.findOne(id, tenantId);
    const config = this.toConfig(account);
    config.webhookUrl = this.webhookUrlFor(account);
    if (account.provider === 'cloudapi')
      return this.wa.registerCloudApiWebhook(config, account.waVerifyToken);
    return this.wa.ensureWahaWebhook(config);
  }

  getOAuthConfig(): WaOAuthPublicConfig {
    return this.oauth.getPublicConfig();
  }

  /** Crea o actualiza la cuenta Cloud API conectada vía Embedded Signup (self-service, sin pegar tokens a mano). */
  async connectViaOAuth(
    tenantId: string,
    data: { code: string; wabaId: string; phoneNumberId: string },
  ) {
    const short = await this.oauth.exchangeCodeForToken(data.code);
    const long = await this.oauth.exchangeForLongLivedToken(short.accessToken);
    await this.oauth.registerPhoneNumber(data.phoneNumberId, long.accessToken);
    const info = await this.oauth.fetchPhoneNumberInfo(
      data.phoneNumberId,
      long.accessToken,
    );

    const tid = new Types.ObjectId(tenantId);
    const tokenExpiresAt = new Date(Date.now() + long.expiresIn * 1000);
    const label =
      info.verifiedName || info.displayPhoneNumber || 'WhatsApp conectado';

    const existing = await this.model
      .findOne({ tenantId: tid, waPhoneNumberId: data.phoneNumberId })
      .exec();
    const account = existing
      ? Object.assign(existing, {
          waAccessToken: long.accessToken,
          waBusinessAccountId: data.wabaId,
          phoneNumber: info.displayPhoneNumber ?? existing.phoneNumber,
          tokenExpiresAt,
          active: true,
        })
      : new this.model({
          tenantId: tid,
          label,
          provider: 'cloudapi',
          phoneNumber: info.displayPhoneNumber,
          waPhoneNumberId: data.phoneNumberId,
          waAccessToken: long.accessToken,
          waBusinessAccountId: data.wabaId,
          waVerifyToken: randomBytes(12).toString('hex'),
          tokenExpiresAt,
          active: true,
          isDefault:
            (await this.model.countDocuments({ tenantId: tid }).exec()) === 0,
        });
    await account.save();

    const config = this.toConfig(account);
    config.webhookUrl = this.webhookUrlFor(account);
    await this.wa.registerCloudApiWebhook(config, account.waVerifyToken);

    return account;
  }

  /** Renueva el token de larga duración de una cuenta Cloud API conectada vía OAuth. */
  async refreshOAuthToken(id: string, tenantId: string) {
    const account = await this.findOne(id, tenantId);
    if (!account.waAccessToken)
      throw new NotFoundException('La cuenta no tiene un token para renovar');
    const { accessToken, expiresIn } =
      await this.oauth.exchangeForLongLivedToken(account.waAccessToken);
    account.waAccessToken = accessToken;
    account.tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
    await account.save();
    return { success: true, tokenExpiresAt: account.tokenExpiresAt };
  }

  async test(id: string, tenantId: string, phone: string) {
    const account = await this.findOne(id, tenantId);
    const config = this.toConfig(account);
    const formatted = this.wa.formatPhone(phone);
    if (!formatted)
      return { success: false, error: 'Número inválido (< 8 dígitos)' };
    try {
      await this.wa.sendMessage(
        formatted,
        '✅ Mensaje de prueba desde MAYA Platform',
        config,
      );
      return { success: true, formattedPhone: formatted };
    } catch (err) {
      return { success: false, formattedPhone: formatted, error: String(err) };
    }
  }
}
