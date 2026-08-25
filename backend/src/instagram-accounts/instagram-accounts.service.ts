import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { InstagramAccount } from './instagram-account.schema';
import {
  CreateInstagramAccountDto,
  UpdateInstagramAccountDto,
} from './dto/instagram-account.dto';
import {
  InstagramService,
  IgConfig,
  IgStatus,
} from '../instagram/instagram.service';
import { InstagramOAuthService } from '../instagram/instagram-oauth.service';

@Injectable()
export class InstagramAccountsService {
  constructor(
    @InjectModel(InstagramAccount.name) private model: Model<InstagramAccount>,
    private ig: InstagramService,
    private oauth: InstagramOAuthService,
    private config: ConfigService,
  ) {}

  /** URL pública única del webhook a nivel de app — Meta no permite una URL distinta por cuenta. */
  globalWebhookUrl(): string | undefined {
    const base = this.config.get<string>('PUBLIC_API_URL');
    if (!base) return undefined;
    return `${base.replace(/\/$/, '')}/ig/webhook`;
  }

  findAll(tenantId: string) {
    return this.model
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string, tenantId: string): Promise<InstagramAccount> {
    const doc = await this.model
      .findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
      })
      .exec();
    if (!doc) throw new NotFoundException('Cuenta de Instagram no encontrada');
    return doc;
  }

  /** Solo por id (uso interno, p.ej. tests). */
  findById(id: string) {
    return this.model.findById(new Types.ObjectId(id)).exec();
  }

  /** Ubica la cuenta por su Instagram User ID — así el webhook (app-level) rutea al tenant correcto. */
  findByIgUserId(igUserId: string) {
    return this.model.findOne({ igBusinessAccountId: igUserId }).exec();
  }

  async create(tenantId: string, dto: CreateInstagramAccountDto) {
    const tid = new Types.ObjectId(tenantId);
    const count = await this.model.countDocuments({ tenantId: tid }).exec();
    return this.model.create({
      ...dto,
      tenantId: tid,
      isDefault: count === 0,
    });
  }

  async getDefault(tenantId: string): Promise<InstagramAccount | null> {
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

  async setDefault(id: string, tenantId: string): Promise<InstagramAccount> {
    const tid = new Types.ObjectId(tenantId);
    const account = await this.findOne(id, tenantId);
    await this.model
      .updateMany({ tenantId: tid }, { $set: { isDefault: false } })
      .exec();
    account.isDefault = true;
    await account.save();
    return account;
  }

  async update(id: string, tenantId: string, dto: UpdateInstagramAccountDto) {
    const doc = await this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId: new Types.ObjectId(tenantId) },
        { $set: dto },
        { new: true },
      )
      .exec();
    if (!doc) throw new NotFoundException('Cuenta de Instagram no encontrada');
    return doc;
  }

  async remove(id: string, tenantId: string) {
    const tid = new Types.ObjectId(tenantId);
    const account = await this.model
      .findOne({ _id: new Types.ObjectId(id), tenantId: tid })
      .exec();
    if (!account)
      throw new NotFoundException('Cuenta de Instagram no encontrada');
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

  toConfig(account: InstagramAccount): IgConfig {
    return {
      igBusinessAccountId: account.igBusinessAccountId,
      pageId: account.pageId,
      pageAccessToken: account.pageAccessToken,
      verifyToken: account.verifyToken,
    };
  }

  async status(id: string, tenantId: string): Promise<IgStatus> {
    const account = await this.findOne(id, tenantId);
    return this.ig.getStatus(this.toConfig(account));
  }

  async subscribeWebhook(id: string, tenantId: string) {
    const account = await this.findOne(id, tenantId);
    return this.ig.subscribeWebhook(this.toConfig(account));
  }

  /** Crea o actualiza la cuenta conectada vía OAuth (self-service, sin pegar tokens a mano). */
  async upsertFromOAuth(
    tenantId: string,
    data: {
      userId: string;
      username?: string;
      accessToken: string;
      expiresIn: number;
    },
  ) {
    const tid = new Types.ObjectId(tenantId);
    const tokenExpiresAt = new Date(Date.now() + data.expiresIn * 1000);
    const existing = await this.model
      .findOne({ tenantId: tid, igBusinessAccountId: data.userId })
      .exec();
    if (existing) {
      existing.pageAccessToken = data.accessToken;
      existing.tokenExpiresAt = tokenExpiresAt;
      existing.username = data.username ?? existing.username;
      existing.active = true;
      await existing.save();
      return existing;
    }
    const count = await this.model.countDocuments({ tenantId: tid }).exec();
    return this.model.create({
      tenantId: tid,
      label: data.username ? `@${data.username}` : 'Instagram conectado',
      username: data.username,
      igBusinessAccountId: data.userId,
      pageAccessToken: data.accessToken,
      tokenExpiresAt,
      active: true,
      isDefault: count === 0,
    });
  }

  /** Renueva el token de larga duración de una cuenta conectada vía OAuth. */
  async refreshOAuthToken(id: string, tenantId: string) {
    const account = await this.findOne(id, tenantId);
    if (!account.pageAccessToken)
      throw new NotFoundException('La cuenta no tiene un token para renovar');
    const { accessToken, expiresIn } = await this.oauth.refreshLongLivedToken(
      account.pageAccessToken,
    );
    account.pageAccessToken = accessToken;
    account.tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
    await account.save();
    return { success: true, tokenExpiresAt: account.tokenExpiresAt };
  }

  async test(id: string, tenantId: string, recipientId: string) {
    const account = await this.findOne(id, tenantId);
    const config = this.toConfig(account);
    if (!recipientId?.trim())
      return { success: false, error: 'Falta el IGSID del destinatario' };
    try {
      await this.ig.sendMessage(
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
