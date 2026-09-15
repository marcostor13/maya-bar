import { Injectable, BadRequestException } from '@nestjs/common';
import {
  AiChatProvider,
  AiChatRequest,
  AiProviderId,
} from './ai-provider.interface';

/** Si el agente no trae un tope (o llega en null desde la base), este se usa. */
const DEFAULT_MAX_TOKENS = 1024;

/**
 * Modelos de razonamiento de OpenAI: rechazan `temperature` distinto de 1 con
 * `Unsupported value: 'temperature'`, así que el parámetro no se envía.
 */
const OPENAI_FIXED_TEMPERATURE = /^(gpt-5|o\d)/i;

/** Respuesta del endpoint de modelos: `data` en OpenAI/DeepSeek/Anthropic, `models` en Gemini. */
interface ModelListResponse {
  data?: { id?: string }[];
  models?: { name?: string; supportedGenerationMethods?: string[] }[];
}

/** Etiquetas por defecto de los mensajes de error (idénticas al código original). */
const DEFAULT_ERROR_LABELS: Record<AiProviderId, string> = {
  deepseek: 'deepseek',
  openai: 'openai',
  claude: 'Claude',
  gemini: 'Gemini',
};

/**
 * Implementación HTTP (fetch) de AiChatProvider.
 * Envuelve las llamadas a DeepSeek/OpenAI/Claude/Gemini sin cambiar
 * endpoints, headers, parseos ni mensajes de error.
 */
@Injectable()
export class HttpAiProvider implements AiChatProvider {
  async chat(req: AiChatRequest): Promise<string> {
    if (req.provider === 'claude') return this.callClaude(req);
    if (req.provider === 'gemini') return this.callGemini(req);
    return this.callOpenAiCompatible(req);
  }

  /**
   * Lista los modelos que el proveedor sirve para esa API key. Cada uno expone
   * su propio endpoint; se devuelve solo el id, que es lo que guarda el agente.
   */
  async listModels(provider: AiProviderId, apiKey: string): Promise<string[]> {
    if (!apiKey) return [];

    if (provider === 'claude') {
      const data = await this.getJson(
        'https://api.anthropic.com/v1/models?limit=100',
        { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        'Claude',
      );
      return this.ids(data.data);
    }

    if (provider === 'gemini') {
      const data = await this.getJson(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=200`,
        {},
        'Gemini',
      );
      return (data.models ?? [])
        .filter((m) =>
          (m.supportedGenerationMethods ?? []).includes('generateContent'),
        )
        .map((m) => (m.name ?? '').replace(/^models\//, ''))
        .filter(Boolean);
    }

    const url =
      provider === 'deepseek'
        ? 'https://api.deepseek.com/models'
        : 'https://api.openai.com/v1/models';
    const data = await this.getJson(
      url,
      { Authorization: `Bearer ${apiKey}` },
      this.errorLabel({ provider } as AiChatRequest),
    );
    return this.ids(data.data);
  }

  private async getJson(
    url: string,
    headers: Record<string, string>,
    label: string,
  ): Promise<ModelListResponse> {
    const res = await fetch(url, { headers });
    if (!res.ok)
      throw new BadRequestException(`${label} API error: ${await res.text()}`);
    return (await res.json()) as ModelListResponse;
  }

  private ids(list?: { id?: string }[]): string[] {
    return (list ?? []).map((m) => m.id ?? '').filter(Boolean);
  }

  private signal(req: AiChatRequest): AbortSignal | undefined {
    return req.timeoutMs ? AbortSignal.timeout(req.timeoutMs) : undefined;
  }

  private errorLabel(req: AiChatRequest): string {
    return req.errorLabel ?? DEFAULT_ERROR_LABELS[req.provider];
  }

  private async callClaude(req: AiChatRequest): Promise<string> {
    const system = req.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const turns = req.messages.filter((m) => m.role !== 'system');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: this.signal(req),
      headers: {
        'x-api-key': req.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: req.model ?? 'claude-haiku-4-5',
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: req.temperature,
        system: system || undefined,
        messages: turns.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok)
      throw new BadRequestException(
        `${this.errorLabel(req)} API error: ${await res.text()}`,
      );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return String(data?.content?.[0]?.text ?? '');
  }

  private async callGemini(req: AiChatRequest): Promise<string> {
    const system = req.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const contents = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
    const gModel = req.model ?? 'gemini-2.0-flash';
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${gModel}:generateContent?key=${req.apiKey}`,
      {
        method: 'POST',
        signal: this.signal(req),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: system ? { parts: [{ text: system }] } : undefined,
          contents,
          generationConfig: {
            temperature: req.temperature,
            maxOutputTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
          },
        }),
      },
    );
    if (!res.ok)
      throw new BadRequestException(
        `${this.errorLabel(req)} API error: ${await res.text()}`,
      );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return String(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
  }

  /** deepseek / openai comparten formato OpenAI-compatible. */
  private async callOpenAiCompatible(req: AiChatRequest): Promise<string> {
    const url =
      req.provider === 'deepseek'
        ? 'https://api.deepseek.com/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
    const defaultModel =
      req.provider === 'deepseek' ? 'deepseek-v4-flash' : 'gpt-4o-mini';
    const model = req.model ?? defaultModel;
    const isOpenAi = req.provider === 'openai';
    const maxTokens = req.maxTokens ?? DEFAULT_MAX_TOKENS;
    const res = await fetch(url, {
      method: 'POST',
      signal: this.signal(req),
      headers: {
        Authorization: `Bearer ${req.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        // OpenAI dejó de aceptar `max_tokens` en Chat Completions;
        // `max_completion_tokens` lo entienden tanto los modelos nuevos como
        // los antiguos. DeepSeek sigue con el nombre clásico.
        ...(isOpenAi
          ? { max_completion_tokens: maxTokens }
          : { max_tokens: maxTokens }),
        ...(isOpenAi && OPENAI_FIXED_TEMPERATURE.test(model)
          ? {}
          : { temperature: req.temperature }),
        messages: req.messages,
      }),
    });
    if (!res.ok)
      throw new BadRequestException(
        `${this.errorLabel(req)} API error: ${await res.text()}`,
      );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return String(data?.choices?.[0]?.message?.content ?? '');
  }
}
