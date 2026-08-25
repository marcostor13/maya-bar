import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_CHAT_PROVIDER } from './providers/ai-provider.interface';
import type {
  AiChatProvider,
  ChatMessage,
} from './providers/ai-provider.interface';

export type { ChatMessage };

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
}

@Injectable()
export class AiService {
  private deepseekKey: string;
  private claudeKey: string;
  private openaiKey: string;
  private geminiKey: string;

  constructor(
    private configService: ConfigService,
    @Inject(AI_CHAT_PROVIDER) private chatProvider: AiChatProvider,
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

  async chat(prompt: string, options: AiOptions = {}): Promise<string> {
    const { provider = 'auto', maxTokens = 1024 } = options;
    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];

    if (provider === 'deepseek' || (provider === 'auto' && this.deepseekKey)) {
      if (!this.deepseekKey)
        throw new BadRequestException('DEEPSEEK_API_KEY no configurada');
      return this.chatProvider.chat({
        provider: 'deepseek',
        apiKey: this.deepseekKey,
        model: 'deepseek-chat',
        maxTokens,
        messages,
        errorLabel: 'DeepSeek',
      });
    }
    if (provider === 'claude' || (provider === 'auto' && this.claudeKey)) {
      if (!this.claudeKey)
        throw new BadRequestException('CLAUDE_API_KEY no configurada');
      return this.chatProvider.chat({
        provider: 'claude',
        apiKey: this.claudeKey,
        model: 'claude-haiku-4-5-20251001',
        maxTokens,
        messages,
        errorLabel: 'Claude',
      });
    }
    if (provider === 'openai' || (provider === 'auto' && this.openaiKey)) {
      if (!this.openaiKey)
        throw new BadRequestException('OPENAI_API_KEY no configurada');
      return this.chatProvider.chat({
        provider: 'openai',
        apiKey: this.openaiKey,
        model: 'gpt-4o-mini',
        maxTokens,
        messages,
        errorLabel: 'OpenAI',
      });
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

  /** Chat con historial de mensajes (system + turnos). */
  async chatMessages(
    messages: ChatMessage[],
    options: AiOptions = {},
  ): Promise<string> {
    const { provider = 'auto', maxTokens = 1024, temperature = 0.4 } = options;
    // trata cadena vacía como "usar el modelo por defecto"
    const model = options.model?.trim() || undefined;
    const keys = this.resolveKeys(options.apiKeys);
    const resolved = this.resolveProvider(provider, keys);

    return this.chatProvider.chat({
      provider: resolved,
      apiKey: keys[resolved],
      model,
      maxTokens,
      temperature,
      messages,
    });
  }

  parseJson<T>(text: string): T {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match)
      throw new BadRequestException('La IA devolvió una respuesta inválida');
    return JSON.parse(match[0]) as T;
  }
}
