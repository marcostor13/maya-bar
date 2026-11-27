import {
  Injectable,
  Inject,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { AiCreditsService } from '../billing/ai-credits.service';
import type { AiAction } from '../billing/usage-ledger.schema';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TenantConfig } from '../settings/tenant-config.schema';
import { AI_CHAT_PROVIDER } from './providers/ai-provider.interface';
import {
  PlatformAiService,
  type PlatformAiAccount,
} from './platform-ai/platform-ai.service';
import type {
  AiChatProvider,
  AiTool,
  AiToolCall,
  ChatMessage,
} from './providers/ai-provider.interface';

export type { AiTool, AiToolCall, ChatMessage };

type AiProvider = 'deepseek' | 'claude' | 'openai' | 'gemini' | 'auto';

/** Keys por-tenant; si faltan se usan las de entorno. */
export interface AiApiKeys {
  deepseek?: string;
  claude?: string;
  openai?: string;
  gemini?: string;
}

interface AiOptions {
  provider?: AiProvider;
  maxTokens?: number;
  model?: string;
  temperature?: number;
  apiKeys?: AiApiKeys;
  /** Tiempo máximo de la llamada; sin él, espera lo que tarde el proveedor. */
  timeoutMs?: number;
  /** Herramientas que el modelo puede llamar antes de responder. */
  tools?: AiTool[];
  runTool?: (call: AiToolCall) => Promise<unknown>;
  /** Mide la llamada en créditos de la empresa (HU43). */
  meter?: { tenantId: string; action: AiAction; units?: number };
}

type ChatReq = Parameters<AiChatProvider['chat']>[0];

/** De dónde sale la key: de la empresa, de la plataforma (HU85) o del servidor con créditos. */
type KeySource = 'byok' | 'platform' | 'credits';

const ERROR_LABEL: Record<string, string> = {
  deepseek: 'DeepSeek',
  claude: 'Claude',
  openai: 'OpenAI',
  gemini: 'Gemini',
};

@Injectable()
export class AiService {
  private deepseekKey: string;
  private claudeKey: string;
  private openaiKey: string;
  private geminiKey: string;

  constructor(
    private configService: ConfigService,
    @Inject(AI_CHAT_PROVIDER) private chatProvider: AiChatProvider,
    // Global (HU43); opcional para las pruebas unitarias.
    @Optional() private credits?: AiCreditsService,
    // HU85; opcional para las pruebas unitarias.
    @Optional() private platform?: PlatformAiService,
    @Optional()
    @Inject(getModelToken(TenantConfig.name))
    private tenantConfigs?: Model<TenantConfig>,
  ) {
    this.deepseekKey = configService.get<string>('DEEPSEEK_API_KEY') ?? '';
    this.claudeKey = configService.get<string>('CLAUDE_API_KEY') ?? '';
    this.openaiKey = configService.get<string>('OPENAI_API_KEY') ?? '';
    this.geminiKey = configService.get<string>('GEMINI_API_KEY') ?? '';
  }

  /** Combina las keys por-tenant con las de entorno (override tiene prioridad). */
  private resolveKeys(override?: AiApiKeys): Required<AiApiKeys> {
    return {
      deepseek: override?.deepseek?.trim() || this.deepseekKey,
      claude: override?.claude?.trim() || this.claudeKey,
      openai: override?.openai?.trim() || this.openaiKey,
      gemini: override?.gemini?.trim() || this.geminiKey,
    };
  }

  /**
   * Cuenta de IA de la plataforma (HU85) si está activa y la empresa no tiene
   * ninguna API key propia; con key propia la empresa elige proveedor y modelo.
   */
  async platformFor(apiKeys?: AiApiKeys): Promise<PlatformAiAccount | null> {
    if (!this.platform) return null;
    if (
      Object.values(apiKeys ?? {}).some((k) =>
        (k as string | undefined)?.trim(),
      )
    )
      return null;
    return this.platform.active();
  }

  /**
   * Keys propias de la empresa para las llamadas que no las traen (`chat()` de
   * textos y puntaje): con alguna propia no se le regala la IA de la plataforma.
   */
  private async tenantKeys(tenantId?: string): Promise<AiApiKeys | undefined> {
    if (!tenantId || !this.tenantConfigs || !Types.ObjectId.isValid(tenantId))
      return undefined;
    const cfg = await this.tenantConfigs
      .findOne({ tenantId: new Types.ObjectId(tenantId) })
      .select('deepseekApiKey claudeApiKey openaiApiKey geminiApiKey')
      .lean<Partial<TenantConfig>>()
      .exec();
    return {
      deepseek: cfg?.deepseekApiKey,
      claude: cfg?.claudeApiKey,
      openai: cfg?.openaiApiKey,
      gemini: cfg?.geminiApiKey,
    };
  }

  /**
   * Ejecuta la llamada midiendo créditos si hay `meter`: comprueba saldo antes
   * (salvo key propia o de la plataforma) y anota tokens y modelo al terminar.
   */
  private async metered(
    req: ChatReq,
    meter: AiOptions['meter'],
    source: KeySource,
    run: (req: ChatReq) => Promise<string>,
  ): Promise<string> {
    if (!meter || !this.credits) return run(req);
    if (source === 'credits')
      await this.credits.assertCanSpend(
        meter.tenantId,
        meter.action,
        meter.units,
      );
    const usage = { inputTokens: 0, outputTokens: 0, model: req.model };
    const out = await run({
      ...req,
      onUsage: (u) => {
        usage.inputTokens += u.inputTokens;
        usage.outputTokens += u.outputTokens;
        usage.model = u.model ?? usage.model;
      },
    });
    await this.credits.record(
      meter.tenantId,
      meter.action,
      {
        byok: source === 'byok',
        platform: source === 'platform',
        provider: req.provider,
        ...usage,
      },
      meter.units,
    );
    return out;
  }

  async chat(prompt: string, options: AiOptions = {}): Promise<string> {
    const provider = options.provider ?? 'auto';
    // `??` y no un default de desestructuración: los agentes viejos guardan
    // `maxTokens: null` y OpenAI rechaza el body con un null ahí.
    const maxTokens = options.maxTokens ?? 1024;
    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];

    const platform = await this.platformFor(
      options.apiKeys ?? (await this.tenantKeys(options.meter?.tenantId)),
    );
    if (platform)
      return this.metered(
        {
          provider: platform.provider,
          apiKey: platform.apiKey,
          model: platform.model,
          maxTokens,
          messages,
          errorLabel: ERROR_LABEL[platform.provider],
        },
        options.meter,
        'platform',
        (r) => this.chatProvider.chat(r),
      );

    if (provider === 'deepseek' || (provider === 'auto' && this.deepseekKey)) {
      if (!this.deepseekKey)
        throw new BadRequestException('DEEPSEEK_API_KEY no configurada');
      return this.metered(
        {
          provider: 'deepseek',
          apiKey: this.deepseekKey,
          model: 'deepseek-chat',
          maxTokens,
          messages,
          errorLabel: 'DeepSeek',
        },
        options.meter,
        'credits',
        (r) => this.chatProvider.chat(r),
      );
    }
    if (provider === 'claude' || (provider === 'auto' && this.claudeKey)) {
      if (!this.claudeKey)
        throw new BadRequestException('CLAUDE_API_KEY no configurada');
      return this.metered(
        {
          provider: 'claude',
          apiKey: this.claudeKey,
          model: 'claude-haiku-4-5',
          maxTokens,
          messages,
          errorLabel: 'Claude',
        },
        options.meter,
        'credits',
        (r) => this.chatProvider.chat(r),
      );
    }
    if (provider === 'openai' || (provider === 'auto' && this.openaiKey)) {
      if (!this.openaiKey)
        throw new BadRequestException('OPENAI_API_KEY no configurada');
      return this.metered(
        {
          provider: 'openai',
          apiKey: this.openaiKey,
          model: 'gpt-4o-mini',
          maxTokens,
          messages,
          errorLabel: 'OpenAI',
        },
        options.meter,
        'credits',
        (r) => this.chatProvider.chat(r),
      );
    }
    throw new BadRequestException(
      'No hay API key de IA configurada (DEEPSEEK_API_KEY, CLAUDE_API_KEY o OPENAI_API_KEY)',
    );
  }

  /** Resuelve qué proveedor usar según las keys disponibles. */
  private resolveProvider(
    provider: AiProvider,
    keys: Required<AiApiKeys>,
  ): 'deepseek' | 'claude' | 'openai' | 'gemini' {
    if (provider === 'deepseek' || (provider === 'auto' && keys.deepseek))
      return 'deepseek';
    if (provider === 'claude' || (provider === 'auto' && keys.claude))
      return 'claude';
    if (provider === 'openai' || (provider === 'auto' && keys.openai))
      return 'openai';
    if (provider === 'gemini' || (provider === 'auto' && keys.gemini))
      return 'gemini';
    throw new BadRequestException(
      'No hay API key de IA configurada (DeepSeek, Claude, OpenAI o Gemini)',
    );
  }

  /** ¿Hay alguna key de IA utilizable: de la empresa, de la plataforma o del servidor? */
  async hasAnyKey(apiKeys?: AiApiKeys): Promise<boolean> {
    if (await this.platformFor(apiKeys)) return true;
    return Object.values(this.resolveKeys(apiKeys)).some(Boolean);
  }

  /** Chat con historial de mensajes (system + turnos). */
  async chatMessages(
    messages: ChatMessage[],
    options: AiOptions = {},
  ): Promise<string> {
    const provider = options.provider ?? 'auto';
    const maxTokens = options.maxTokens ?? 1024;
    const temperature = options.temperature ?? 0.4;
    // trata cadena vacía como "usar el modelo por defecto"
    const model = options.model?.trim() || undefined;
    const base = {
      maxTokens,
      temperature,
      messages,
      timeoutMs: options.timeoutMs,
    };
    let req: ChatReq;
    let source: KeySource;
    const platform = await this.platformFor(options.apiKeys);
    if (platform) {
      // La plataforma fija proveedor y modelo, pida lo que pida el agente.
      req = {
        ...base,
        provider: platform.provider,
        apiKey: platform.apiKey,
        model: platform.model,
      };
      source = 'platform';
    } else {
      const keys = this.resolveKeys(options.apiKeys);
      const resolved = this.resolveProvider(provider, keys);
      req = { ...base, provider: resolved, apiKey: keys[resolved], model };
      // Con la key propia de la empresa no se descuentan créditos (HU43).
      source = options.apiKeys?.[resolved]?.trim() ? 'byok' : 'credits';
    }
    const { tools, runTool } = options;
    if (tools?.length && runTool)
      return this.metered(req, options.meter, source, (r) =>
        this.chatProvider.chatWithTools({ ...r, tools, runTool }),
      );
    return this.metered(req, options.meter, source, (r) =>
      this.chatProvider.chat(r),
    );
  }

  /** Modelos que la API key del tenant puede usar hoy en ese proveedor. */
  async listModels(
    provider: 'deepseek' | 'claude' | 'openai' | 'gemini',
    apiKeys?: AiApiKeys,
  ): Promise<string[]> {
    const keys = this.resolveKeys(apiKeys);
    const key = keys[provider];
    if (!key) throw new BadRequestException(`No hay API key de ${provider}`);
    return this.chatProvider.listModels(provider, key);
  }

  parseJson<T>(text: string): T {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match)
      throw new BadRequestException('La IA devolvió una respuesta inválida');
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      // Casi siempre es una respuesta cortada por el tope de tokens.
      throw new BadRequestException(
        'La IA devolvió una respuesta incompleta o con formato inválido',
      );
    }
  }
}
