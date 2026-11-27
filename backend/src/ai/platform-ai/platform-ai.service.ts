import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SecretBox } from '../../shared/secret-box';
import {
  AI_MODEL_CATALOG,
  isChatModel,
  mergeWithCatalog,
  type AiModelOption,
} from '../ai-models.catalog';
import {
  AI_CHAT_PROVIDER,
  type AiChatProvider,
  type AiProviderId,
} from '../providers/ai-provider.interface';
import type {
  PlatformAiModelsDto,
  SavePlatformAiDto,
  TestPlatformAiDto,
} from './platform-ai.dto';
import { PlatformAiSettings } from './platform-ai.schema';

/** Cuenta lista para llamar al proveedor. */
export interface PlatformAiAccount {
  provider: AiProviderId;
  model: string;
  apiKey: string;
}

/** Lo que ve el superadmin: nunca la key. */
export interface PlatformAiView {
  enabled: boolean;
  provider?: AiProviderId;
  model?: string;
  hasKey: boolean;
  keyHint?: string;
  updatedAt?: Date;
}

const CACHE_MS = 30_000;

/** Cuenta de IA de la plataforma para las empresas sin key propia (HU85). */
@Injectable()
export class PlatformAiService {
  private readonly logger = new Logger(PlatformAiService.name);
  private readonly box: SecretBox;
  private cache?: { at: number; value: PlatformAiAccount | null };

  constructor(
    @InjectModel(PlatformAiSettings.name)
    private model: Model<PlatformAiSettings>,
    @Inject(AI_CHAT_PROVIDER) private chatProvider: AiChatProvider,
    config: ConfigService,
  ) {
    this.box = new SecretBox(
      config.get<string>('EMAIL_ENCRYPTION_KEY') ||
        config.getOrThrow<string>('JWT_SECRET'),
    );
  }

  private find() {
    return this.model.findOne({ key: 'default' }).exec();
  }

  /** La cuenta activa, o null. Con caché para no ir a Mongo en cada mensaje. */
  async active(now = Date.now()): Promise<PlatformAiAccount | null> {
    if (this.cache && now - this.cache.at < CACHE_MS) return this.cache.value;
    let value: PlatformAiAccount | null = null;
    try {
      const doc = await this.find();
      if (doc?.enabled && doc.provider && doc.aiModel && doc.apiKeyEnc)
        value = {
          provider: doc.provider,
          model: doc.aiModel,
          apiKey: this.box.decrypt(doc.apiKeyEnc),
        };
    } catch (err) {
      // Sin la cuenta se sigue con el flujo anterior (keys de entorno y créditos).
      this.logger.error(
        `No se pudo leer la IA de la plataforma: ${String(err)}`,
      );
    }
    this.cache = { at: now, value };
    return value;
  }

  async view(): Promise<PlatformAiView> {
    const doc = await this.find();
    return {
      enabled: !!doc?.enabled,
      provider: doc?.provider,
      model: doc?.aiModel,
      hasKey: !!doc?.apiKeyEnc,
      keyHint: doc?.keyLast4 ? `••••${doc.keyLast4}` : undefined,
      updatedAt: doc?.updatedAt,
    };
  }

  async save(dto: SavePlatformAiDto, actorId: string): Promise<PlatformAiView> {
    const doc = await this.find();
    const provider = dto.provider ?? doc?.provider;
    const model = dto.model?.trim() || undefined;
    const newKey = dto.apiKey?.trim();
    // Una key guardada solo sirve para el proveedor con el que se guardó.
    const keepKey = !newKey && !!doc?.apiKeyEnc && doc.provider === provider;

    if (dto.enabled) {
      if (!provider) throw new BadRequestException('Elige el proveedor de IA');
      if (!model) throw new BadRequestException('Elige el modelo');
      if (!newKey && !keepKey)
        throw new BadRequestException('Escribe la API key del proveedor');
    }

    const set: Record<string, unknown> = {
      enabled: dto.enabled,
      provider,
      aiModel: model,
      updatedBy: actorId,
    };
    const unset: Record<string, 1> = {};
    if (newKey) {
      set.apiKeyEnc = this.box.encrypt(newKey);
      set.keyLast4 = newKey.slice(-4);
    } else if (!keepKey) {
      unset.apiKeyEnc = 1;
      unset.keyLast4 = 1;
    }
    await this.model
      .updateOne(
        { key: 'default' },
        { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
        { upsert: true },
      )
      .exec();
    this.cache = undefined;
    this.logger.log(
      `IA de la plataforma ${dto.enabled ? 'activada' : 'desactivada'}: ${provider ?? '-'} / ${model ?? '-'} (por ${actorId})`,
    );
    return this.view();
  }

  /** La key escrita en la pantalla o, si no hay, la guardada de ese proveedor. */
  private async keyFor(
    provider: AiProviderId,
    typed?: string,
  ): Promise<string> {
    if (typed?.trim()) return typed.trim();
    const doc = await this.find();
    if (doc?.apiKeyEnc && doc.provider === provider)
      return this.box.decrypt(doc.apiKeyEnc);
    throw new BadRequestException('Escribe la API key del proveedor');
  }

  async listModels(dto: PlatformAiModelsDto): Promise<{
    source: 'live' | 'catalog';
    models: AiModelOption[];
  }> {
    const apiKey = await this.keyFor(dto.provider, dto.apiKey);
    try {
      const live = (
        await this.chatProvider.listModels(dto.provider, apiKey)
      ).filter(isChatModel);
      if (live.length)
        return { source: 'live', models: mergeWithCatalog(dto.provider, live) };
    } catch (err) {
      this.logger.warn(
        `No se pudo listar los modelos de ${dto.provider}: ${String(err)}`,
      );
    }
    return { source: 'catalog', models: AI_MODEL_CATALOG[dto.provider] };
  }

  /** Llamada mínima para comprobar proveedor, key y modelo. */
  async test(dto: TestPlatformAiDto): Promise<{ ok: true; reply: string }> {
    const apiKey = await this.keyFor(dto.provider, dto.apiKey);
    try {
      const reply = await this.chatProvider.chat({
        provider: dto.provider,
        apiKey,
        model: dto.model.trim(),
        maxTokens: 20,
        messages: [{ role: 'user', content: 'Responde solo: ok' }],
        timeoutMs: 20_000,
      });
      return { ok: true, reply: reply.slice(0, 200) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(
        `El proveedor rechazó la prueba: ${msg.split(apiKey).join('***').slice(0, 300)}`,
      );
    }
  }
}
