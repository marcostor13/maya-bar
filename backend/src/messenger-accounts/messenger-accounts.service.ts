import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { MessengerAccount } from './messenger-account.schema';
import {
  CreateMessengerAccountDto,
  UpdateMessengerAccountDto,
} from './dto/messenger-account.dto';
import {
  MessengerService,
  MsConfig,
  MsStatus,
} from '../messenger/messenger.service';
import { MsPage } from '../messenger/messenger-oauth.service';

@Injectable()
export class MessengerAccountsService {
  constructor(
    @InjectModel(MessengerAccount.name) private model: Model<MessengerAccount>,
    private ms: MessengerService,
    private config: ConfigService,
  ) {}

  /** URL pública única del webhook a nivel de app — Meta no permite una URL distinta por Página. */
  globalWebhookUrl(): string | undefined {
    const base = this.config.get<string>('PUBLIC_API_URL');
    if (!base) return undefined;
    return `${base.replace(/\/$/, '')}/messenger/webhook`;
  }

  /** Verify token que Meta debe enviar al validar el webhook de Messenger. */
  globalVerifyToken(): string | undefined {
    return this.config.get<string>('MESSENGER_VERIFY_TOKEN');
  }

  findAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string, tenantId: string): Promise<MessengerAccount> {
    const doc = await this.model
      .findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
      })
      .exec();
    if (!doc) throw new NotFoundException('Cuenta de Messenger no encontrada');
    return doc;
  }

  /** Solo por id (uso interno, p.ej. al entregar un mensaje saliente). */
  findById(id: string) {
    return this.model.findById(new Types.ObjectId(id)).exec();
  }

  /** Ubica la cuenta por su Page ID — así el webhook (app-level) rutea al tenant correcto. */
  findByPageId(pageId: string) {
    return this.model.findOne({ pageId }).exec();
  }

  async create(tenantId: string, dto: CreateMessengerAccountDto) {
    const tid = new Types.ObjectId(tenantId);
    const count = await this.model.countDocuments({ tenantId: tid }).exec();
    return this.model.create({
      ...dto,
      tenantId: tid,
      isDefault: count === 0,
    });
  }

  async getDefault(tenantId: string): Promise<MessengerAccount | null> {
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

  async setDefault(id: string, tenantId: string): Promise<MessengerAccount> {
    const tid = new Types.ObjectId(tenantId);
    const account = await this.findOne(id, tenantId);
    await this.model
      .updateMany({ tenantId: tid }, { $set: { isDefault: false } })
      .exec();
    account.isDefault = true;
    await account.save();
    return account;
  }

  async update(id: string, tenantId: string, dto: UpdateMessengerAccountDto) {
    const doc = await this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId: new Types.ObjectId(tenantId) },
        { $set: dto },
        { new: true },
      )
      .exec();
    if (!doc) throw new NotFoundException('Cuenta de Messenger no encontrada');
    return doc;
  }

  async remove(id: string, tenantId: string) {
    const tid = new Types.ObjectId(tenantId);
    const account = await this.model
      .findOne({ _id: new Types.ObjectId(id), tenantId: tid })
      .exec();
    if (!account)
      throw new NotFoundException('Cuenta de Messenger no encontrada');
    await this.model.deleteOne({ _id: account._id }).exec();
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

  toConfig(account: MessengerAccount): MsConfig {
    return {
      pageId: account.pageId,
      pageAccessToken: account.pageAccessToken,
    };
  }

  async status(id: string, tenantId: string): Promise<MsStatus> {
    const account = await this.findOne(id, tenantId);
    return this.ms.getStatus(this.toConfig(account));
  }

  async subscribeWebhook(id: string, tenantId: string) {
    const account = await this.findOne(id, tenantId);
    return this.ms.subscribeWebhook(this.toConfig(account));
  }

  /**
   * Crea o actualiza las cuentas de las Páginas autorizadas vía OAuth
   * (self-service, sin pegar tokens a mano). Una autorización puede traer
   * varias Páginas: se conecta cada una.
   */
  async upsertFromOAuth(
    tenantId: string,
    pages: MsPage[],
    tokenExpiresAt?: Date,
  ): Promise<MessengerAccount[]> {
    const tid = new Types.ObjectId(tenantId);
    const saved: MessengerAccount[] = [];

    for (const page of pages) {
      const existing = await this.model
        .findOne({ tenantId: tid, pageId: page.id })
        .exec();
      if (existing) {
        existing.pageAccessToken = page.accessToken;
        existing.pageName = page.name ?? existing.pageName;
        existing.username = page.username ?? existing.username;
        existing.tokenExpiresAt = tokenExpiresAt;
        existing.active = true;
        await existing.save();
        saved.push(existing);
        continue;
      }
      const count = await this.model.countDocuments({ tenantId: tid }).exec();
      saved.push(
        await this.model.create({
          tenantId: tid,
          label: page.name || 'Messenger conectado',
          pageName: page.name,
          username: page.username,
          pageId: page.id,
          pageAccessToken: page.accessToken,
          tokenExpiresAt,
          active: true,
          isDefault: count === 0,
        }),
      );
    }

    return saved;
  }

  async test(id: string, tenantId: string, recipientId: string) {
    const account = await this.findOne(id, tenantId);
    const config = this.toConfig(account);
    if (!recipientId?.trim())
      return { success: false, error: 'Falta el PSID del destinatario' };
    try {
      await this.ms.sendMessage(
        recipientId.trim(),
        '✅ Mensaje de prueba desde MAYA Platform',
        config,
      );
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
}
