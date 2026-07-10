import { Injectable, BadRequestException } from '@nestjs/common';
import {
  AiChatProvider,
  AiChatRequest,
  AiProviderId,
} from './ai-provider.interface';

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
      headers: {
        'x-api-key': req.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: req.model ?? 'claude-haiku-4-5-20251001',
        max_tokens: req.maxTokens,
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
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: system ? { parts: [{ text: system }] } : undefined,
          contents,
          generationConfig: {
            temperature: req.temperature,
            maxOutputTokens: req.maxTokens,
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
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${req.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: req.model ?? defaultModel,
        max_tokens: req.maxTokens,
        temperature: req.temperature,
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
