import { Injectable, BadRequestException } from '@nestjs/common';
import {
  AiChatProvider,
  AiChatRequest,
  AiProviderId,
  AiToolCall,
  AiToolChatRequest,
} from './ai-provider.interface';

/** Si el agente no trae un tope (o llega en null desde la base), este se usa. */
const DEFAULT_MAX_TOKENS = 1024;

/** Vueltas modelo → herramientas antes de exigir la respuesta final. */
const DEFAULT_TOOL_ROUNDS = 4;

interface ClaudeResponse {
  stop_reason?: string;
  content?: {
    type?: string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }[];
}

interface OpenAiMessage {
  role?: string;
  content?: string | null;
  tool_calls?: {
    id: string;
    function?: { name?: string; arguments?: string };
  }[];
}

/**
 * Modelos de razonamiento de OpenAI: rechazan `temperature` distinto de 1 con
 * `Unsupported value: 'temperature'`, así que el parámetro no se envía.
 */
const OPENAI_FIXED_TEMPERATURE = /^(gpt-5|o\d)/i;

/**
 * Claude solo acepta `temperature` hasta la generación 4.6 (Haiku 4.5, Sonnet/Opus
 * ≤ 4.6, familia 3). Desde Opus 4.7 y en toda la 5.x responde
 * "`temperature` is deprecated for this model", así que se omite.
 */
const CLAUDE_ACCEPTS_TEMPERATURE =
  /^claude-(3[-.]|haiku-4-5|(sonnet|opus)-4(-[0-6])?(-\d{8})?$)/i;

/** Tope mínimo para Claude con razonamiento: el thinking sale del mismo `max_tokens`. */
const CLAUDE_THINKING_MIN_TOKENS = 2048;

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

  /**
   * Llama herramientas en bucle hasta que el modelo responde con texto. Las
   * llamadas de una misma vuelta se ejecutan en paralelo. Gemini no tiene el
   * bucle implementado: responde sin herramientas.
   */
  async chatWithTools(req: AiToolChatRequest): Promise<string> {
    if (!req.tools.length || req.provider === 'gemini') return this.chat(req);
    return req.provider === 'claude'
      ? this.claudeWithTools(req)
      : this.openAiWithTools(req);
  }

  /** Ejecuta las llamadas de una vuelta; un fallo se le devuelve al modelo como error. */
  private runCalls<T>(
    req: AiToolChatRequest,
    calls: { id: string; call: AiToolCall }[],
    toResult: (id: string, content: string, isError: boolean) => T,
  ): Promise<T[]> {
    return Promise.all(
      calls.map(async ({ id, call }) => {
        try {
          const out = await req.runTool(call);
          return toResult(id, JSON.stringify(out ?? null), false);
        } catch (err) {
          return toResult(
            id,
            JSON.stringify({ error: String((err as Error)?.message ?? err) }),
            true,
          );
        }
      }),
    );
  }

  /** Partes comunes de una petición a Claude. */
  private claudeBase(req: AiChatRequest) {
    const system = req.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const turns = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));
    const model = req.model ?? 'claude-haiku-4-5';
    const legacy = CLAUDE_ACCEPTS_TEMPERATURE.test(model);
    const maxTokens = req.maxTokens ?? DEFAULT_MAX_TOKENS;
    return {
      system,
      turns,
      body: {
        model,
        // En los modelos que razonan (los que ya no aceptan temperature) el
        // razonamiento consume del mismo tope: con 800 la respuesta podía quedar vacía.
        max_tokens: legacy
          ? maxTokens
          : Math.max(maxTokens, CLAUDE_THINKING_MIN_TOKENS),
        temperature: legacy ? req.temperature : undefined,
      },
    };
  }

  private async postClaude(
    req: AiChatRequest,
    body: Record<string, unknown>,
  ): Promise<ClaudeResponse> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: this.signal(req),
      headers: {
        'x-api-key': req.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok)
      throw new BadRequestException(
        `${this.errorLabel(req)} API error: ${await res.text()}`,
      );
    return (await res.json()) as ClaudeResponse;
  }

  /**
   * Los modelos con razonamiento (Sonnet/Opus 5.x) devuelven primero un bloque
   * `thinking` vacío; la respuesta va en los bloques `text` que siguen.
   */
  private claudeText(data: ClaudeResponse): string {
    return (data?.content ?? [])
      .filter((b) => b.type === 'text' || (b.type === undefined && b.text))
      .map((b) => b.text ?? '')
      .join('');
  }

  private async callClaude(req: AiChatRequest): Promise<string> {
    const { system, turns, body } = this.claudeBase(req);
    const data = await this.postClaude(req, {
      ...body,
      system: system || undefined,
      messages: turns,
    });
    return this.claudeText(data);
  }

  private async claudeWithTools(req: AiToolChatRequest): Promise<string> {
    const { system, turns, body } = this.claudeBase(req);
    const messages: unknown[] = [...turns];
    const tools = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
    const rounds = req.maxRounds ?? DEFAULT_TOOL_ROUNDS;
    for (let round = 0; ; round++) {
      const last = round >= rounds;
      const data = await this.postClaude(req, {
        ...body,
        // El prompt y las herramientas se repiten en cada vuelta: se cachean.
        system: system
          ? [
              {
                type: 'text',
                text: system,
                cache_control: { type: 'ephemeral' },
              },
            ]
          : undefined,
        tools,
        ...(last ? { tool_choice: { type: 'none' } } : {}),
        messages,
      });
      const uses = (data.content ?? []).filter((b) => b.type === 'tool_use');
      if (last || data.stop_reason !== 'tool_use' || !uses.length)
        return this.claudeText(data);
      // El turno vuelve tal cual (con sus bloques thinking): la API lo exige.
      messages.push({ role: 'assistant', content: data.content });
      const results = await this.runCalls(
        req,
        uses.map((u) => ({
          id: u.id ?? '',
          call: { name: u.name ?? '', input: u.input ?? {} },
        })),
        (id, content, isError) => ({
          type: 'tool_result',
          tool_use_id: id,
          content,
          ...(isError ? { is_error: true } : {}),
        }),
      );
      messages.push({ role: 'user', content: results });
    }
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

  /** Partes comunes de una petición OpenAI-compatible (deepseek / openai). */
  private openAiBase(req: AiChatRequest) {
    const defaultModel =
      req.provider === 'deepseek' ? 'deepseek-v4-flash' : 'gpt-4o-mini';
    const model = req.model ?? defaultModel;
    const isOpenAi = req.provider === 'openai';
    const maxTokens = req.maxTokens ?? DEFAULT_MAX_TOKENS;
    return {
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
    };
  }

  private async postOpenAi(
    req: AiChatRequest,
    body: Record<string, unknown>,
  ): Promise<OpenAiMessage | undefined> {
    const url =
      req.provider === 'deepseek'
        ? 'https://api.deepseek.com/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
    const res = await fetch(url, {
      method: 'POST',
      signal: this.signal(req),
      headers: {
        Authorization: `Bearer ${req.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok)
      throw new BadRequestException(
        `${this.errorLabel(req)} API error: ${await res.text()}`,
      );
    const data = (await res.json()) as {
      choices?: { message?: OpenAiMessage }[];
    };
    return data?.choices?.[0]?.message;
  }

  /** deepseek / openai comparten formato OpenAI-compatible. */
  private async callOpenAiCompatible(req: AiChatRequest): Promise<string> {
    const msg = await this.postOpenAi(req, {
      ...this.openAiBase(req),
      messages: req.messages,
    });
    return String(msg?.content ?? '');
  }

  private async openAiWithTools(req: AiToolChatRequest): Promise<string> {
    const base = this.openAiBase(req);
    const messages: unknown[] = [...req.messages];
    const tools = req.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
    const rounds = req.maxRounds ?? DEFAULT_TOOL_ROUNDS;
    for (let round = 0; ; round++) {
      const last = round >= rounds;
      const msg = await this.postOpenAi(req, {
        ...base,
        tools,
        ...(last ? { tool_choice: 'none' } : {}),
        messages,
      });
      const calls = msg?.tool_calls ?? [];
      if (last || !calls.length) return String(msg?.content ?? '');
      messages.push(msg);
      const results = await this.runCalls(
        req,
        calls.map((c) => ({
          id: c.id,
          call: {
            name: c.function?.name ?? '',
            input: parseArgs(c.function?.arguments),
          },
        })),
        (id, content) => ({ role: 'tool', tool_call_id: id, content }),
      );
      messages.push(...results);
    }
  }
}

/** Los argumentos llegan como texto JSON; si no parsea, la herramienta recibe {}. */
function parseArgs(raw?: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(raw || '{}');
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
