import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type AiProvider = 'deepseek' | 'claude' | 'openai' | 'auto';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AiOptions {
  provider?: AiProvider;
  maxTokens?: number;
  model?: string;
  temperature?: number;
}

@Injectable()
export class AiService {
  private deepseekKey: string;
  private claudeKey: string;
  private openaiKey: string;

  constructor(private configService: ConfigService) {
    this.deepseekKey = configService.get<string>('DEEPSEEK_API_KEY') ?? '';
    this.claudeKey = configService.get<string>('CLAUDE_API_KEY') ?? '';
    this.openaiKey = configService.get<string>('OPENAI_API_KEY') ?? '';
  }

  async chat(prompt: string, options: AiOptions = {}): Promise<string> {
    const { provider = 'auto', maxTokens = 1024 } = options;

    if (provider === 'deepseek' || (provider === 'auto' && this.deepseekKey)) {
      return this.callDeepSeek(prompt, maxTokens);
    }
    if (provider === 'claude' || (provider === 'auto' && this.claudeKey)) {
      return this.callClaude(prompt, maxTokens);
    }
    if (provider === 'openai' || (provider === 'auto' && this.openaiKey)) {
      return this.callOpenAI(prompt, maxTokens);
    }
    throw new BadRequestException(
      'No hay API key de IA configurada (DEEPSEEK_API_KEY, CLAUDE_API_KEY o OPENAI_API_KEY)',
    );
  }

  /** Resuelve qué proveedor usar según las keys disponibles. */
  private resolveProvider(provider: AiProvider): 'deepseek' | 'claude' | 'openai' {
    if (provider === 'deepseek' || (provider === 'auto' && this.deepseekKey)) return 'deepseek';
    if (provider === 'claude' || (provider === 'auto' && this.claudeKey)) return 'claude';
    if (provider === 'openai' || (provider === 'auto' && this.openaiKey)) return 'openai';
    throw new BadRequestException(
      'No hay API key de IA configurada (DEEPSEEK_API_KEY, CLAUDE_API_KEY o OPENAI_API_KEY)',
    );
  }

  /** Chat con historial de mensajes (system + turnos). */
  async chatMessages(messages: ChatMessage[], options: AiOptions = {}): Promise<string> {
    const { provider = 'auto', maxTokens = 1024, temperature = 0.4 } = options;
    // trata cadena vacía como "usar el modelo por defecto"
    const model = options.model?.trim() || undefined;
    const resolved = this.resolveProvider(provider);

    if (resolved === 'claude') {
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
      const turns = messages.filter((m) => m.role !== 'system');
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.claudeKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: model ?? 'claude-haiku-4-5-20251001',
          // (model ya viene normalizado: undefined si estaba vacío)
          max_tokens: maxTokens,
          temperature,
          system: system || undefined,
          messages: turns.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) throw new BadRequestException(`Claude API error: ${await res.text()}`);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return String(data?.content?.[0]?.text ?? '');
    }

    // deepseek / openai comparten formato OpenAI-compatible
    const url = resolved === 'deepseek'
      ? 'https://api.deepseek.com/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
    const key = resolved === 'deepseek' ? this.deepseekKey : this.openaiKey;
    const defaultModel = resolved === 'deepseek' ? 'deepseek-v4-flash' : 'gpt-4o-mini';
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: model ?? defaultModel,
        max_tokens: maxTokens,
        temperature,
        messages,
      }),
    });
    if (!res.ok) throw new BadRequestException(`${resolved} API error: ${await res.text()}`);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return String(data?.choices?.[0]?.message?.content ?? '');
  }

  private async callDeepSeek(prompt: string, maxTokens: number): Promise<string> {
    if (!this.deepseekKey)
      throw new BadRequestException('DEEPSEEK_API_KEY no configurada');

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.deepseekKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new BadRequestException(`DeepSeek API error: ${err}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return String(data?.choices?.[0]?.message?.content ?? '');
  }

  private async callClaude(prompt: string, maxTokens: number): Promise<string> {
    if (!this.claudeKey)
      throw new BadRequestException('CLAUDE_API_KEY no configurada');

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.claudeKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new BadRequestException(`Claude API error: ${err}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return String(data?.content?.[0]?.text ?? '');
  }

  private async callOpenAI(prompt: string, maxTokens: number): Promise<string> {
    if (!this.openaiKey)
      throw new BadRequestException('OPENAI_API_KEY no configurada');

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.openaiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new BadRequestException(`OpenAI API error: ${err}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return String(data?.choices?.[0]?.message?.content ?? '');
  }

  parseJson<T>(text: string): T {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) throw new BadRequestException('La IA devolvió una respuesta inválida');
    return JSON.parse(match[0]) as T;
  }
}
