import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WhatsAppAccount } from './whatsapp-account.schema';
import { CreateWhatsAppAccountDto, UpdateWhatsAppAccountDto } from './dto/whatsapp-account.dto';
import { WhatsAppService, WaConfig, WaStatus } from '../whatsapp/whatsapp.service';

@Injectable()
export class WhatsAppAccountsService {
  constructor(
    @InjectModel(WhatsAppAccount.name) private model: Model<WhatsAppAccount>,
    private wa: WhatsAppService,
  ) {}

  findAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string, tenantId: string): Promise<WhatsAppAccount> {
    const doc = await this.model
      .findOne({ _id: new Types.ObjectId(id), tenantId: new Types.ObjectId(tenantId) })
      .exec();
    if (!doc) throw new NotFoundException('Cuenta de WhatsApp no encontrada');
    return doc;
  }

  /** Solo por id (uso interno, p.ej. webhooks). */
  findById(id: string) {
    return this.model.findById(new Types.ObjectId(id)).exec();
  }

  create(tenantId: string, dto: CreateWhatsAppAccountDto) {
    return this.model.create({
      ...dto,
      tenantId: new Types.ObjectId(tenantId),
    });
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
    const res = await this.model
      .deleteOne({ _id: new Types.ObjectId(id), tenantId: new Types.ObjectId(tenantId) })
      .exec();
    if (res.deletedCount === 0) throw new NotFoundException('Cuenta de WhatsApp no encontrada');
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
    };
  }

  async status(id: string, tenantId: string): Promise<WaStatus> {
    const account = await this.findOne(id, tenantId);
    return this.wa.getStatus(this.toConfig(account));
  }

  async qr(id: string, tenantId: string) {
    const account = await this.findOne(id, tenantId);
    return this.wa.getQr(this.toConfig(account));
  }

  async test(id: string, tenantId: string, phone: string) {
    const account = await this.findOne(id, tenantId);
    const config = this.toConfig(account);
    const formatted = this.wa.formatPhone(phone);
    if (!formatted) return { success: false, error: 'Número inválido (< 8 dígitos)' };
    try {
      await this.wa.sendMessage(formatted, '✅ Mensaje de prueba desde MAYA Platform', config);
      return { success: true, formattedPhone: formatted };
    } catch (err) {
      return { success: false, formattedPhone: formatted, error: String(err) };
    }
  }
}
